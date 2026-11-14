import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Upload, RefreshCw, Trash2, Download, ShoppingBag, SwitchCamera,
  X, Loader2, ShieldCheck, Check, Info, AlertTriangle, Search, Sparkles,
} from 'lucide-react';
import { virtualTrial, resolveImageUrl } from '../api';
import { api } from '../api';
import { useCart, useToast } from '../contexts';
import { usePose, drawPose } from './usePose';
import { ComingSoon } from './ComingSoon';
import { formatCurrency } from '../lib/format';

// ============================================================
// VIRTUAL TRIAL APP — webcam/upload → on-device pose → pick a real product →
// AI try-on (via server adapter; honest placeholder until a model is connected)
// → before/after, download, add to cart. Privacy-first: photos go to a private
// server store, are auto-deleted on a retention timer, and the user can delete
// their session at any time.
// ============================================================
export function VirtualTrialApp({ onNavigate }) {
  const toast = useToast();
  const { addItem } = useCart();
  const pose = usePose();

  const [config, setConfig] = useState(null);
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState(null); // 'camera' | 'upload' | null
  const [cameraError, setCameraError] = useState('');
  const [facing, setFacing] = useState('user');
  const [photo, setPhoto] = useState(null); // { url, blob }
  const [session, setSession] = useState(null); // { sessionId, photoId }
  const [busy, setBusy] = useState(''); // '', 'uploading', 'generating'
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null); // { imageUrl } | { placeholder:true }
  const [progress, setProgress] = useState(0);
  const [showAfter, setShowAfter] = useState(true);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const photoImgRef = useRef(null);
  const poseCanvasRef = useRef(null);
  const sessionRef = useRef(null);
  const pollRef = useRef(null);
  sessionRef.current = session;

  // Load config + catalog once.
  useEffect(() => {
    virtualTrial.getConfig().then((r) => setConfig(r.data)).catch(() => setConfig({ enabled: true, provider_connected: false }));
    Promise.all([api.getProducts(), api.getCategories()])
      .then(([p, c]) => { setProducts(p.data || []); setCategories(c.data || []); })
      .catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Cleanup on unmount: stop camera, revoke urls, delete the server session
  // (privacy — don't leave the customer's photo on the server after they leave).
  useEffect(() => () => {
    stopCamera();
    if (pollRef.current) clearInterval(pollRef.current);
    const s = sessionRef.current;
    if (s?.sessionId) virtualTrial.deleteSession(s.sessionId);
  }, [stopCamera]);

  const startCamera = useCallback(async (facingMode = 'user') => {
    setCameraError('');
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      streamRef.current = stream;
      setMode('camera');
      setFacing(facingMode);
      // Attach after the <video> is in the DOM.
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } });
    } catch (err) {
      setCameraError(
        err?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow access, or upload a photo instead.'
        : err?.name === 'NotFoundError' ? 'No camera found. You can upload a photo instead.'
        : 'Could not start the camera. You can upload a photo instead.',
      );
      setMode(null);
    }
  }, [stopCamera]);

  const uploadToServer = useCallback(async (blob) => {
    setBusy('uploading');
    try {
      const data = await virtualTrial.uploadPhoto(blob);
      setSession(data);
    } catch (err) {
      toast.push(err.message || 'Could not upload photo', 'error');
    } finally {
      setBusy('');
    }
  }, [toast]);

  const runPose = useCallback((url) => {
    const img = new Image();
    img.onload = async () => {
      const pts = await pose.detect(img);
      const c = poseCanvasRef.current;
      if (c) drawPose(c, pts, img.naturalWidth, img.naturalHeight);
    };
    img.src = url;
  }, [pose]);

  const usePhoto = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    setPhoto({ url, blob });
    setResult(null);
    setSelected(null);
    uploadToServer(blob);
    runPose(url);
  }, [uploadToServer, runPose]);

  const capturePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob((blob) => { if (blob) { usePhoto(blob); stopCamera(); setMode(null); } }, 'image/jpeg', 0.92);
  }, [usePhoto, stopCamera]);

  const onFile = useCallback((file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.push('Please choose a JPEG, PNG, or WebP image.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.push('Photo is too large (max 10 MB).', 'error'); return; }
    usePhoto(file);
    setMode(null);
  }, [usePhoto, toast]);

  const resetAll = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    stopCamera();
    if (photo?.url) URL.revokeObjectURL(photo.url);
    if (result?.imageUrl) URL.revokeObjectURL(result.imageUrl);
    const s = sessionRef.current;
    if (s?.sessionId) await virtualTrial.deleteSession(s.sessionId).catch(() => {});
    setPhoto(null); setSession(null); setResult(null); setSelected(null);
    setMode(null); setProgress(0); pose.reset();
  }, [photo, result, stopCamera, pose]);

  const generate = useCallback(async (product) => {
    if (!session) { toast.push('Please wait — your photo is still uploading.', 'info'); return; }
    setSelected(product);
    setResult(null);
    setBusy('generating');
    setProgress(10);
    try {
      const { jobId } = await virtualTrial.generate(session.sessionId, session.photoId, product.id);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const st = await virtualTrial.status(jobId, session.sessionId);
          setProgress(st.progress || 50);
          if (st.status === 'done') {
            clearInterval(pollRef.current);
            const r = await virtualTrial.result(jobId, session.sessionId);
            setResult(r); setShowAfter(true); setBusy('');
          } else if (st.status === 'placeholder') {
            clearInterval(pollRef.current);
            setResult({ placeholder: true }); setBusy('');
          } else if (st.status === 'failed') {
            clearInterval(pollRef.current);
            setBusy(''); toast.push(st.error || 'Generation failed. Please try again.', 'error');
          }
        } catch {
          clearInterval(pollRef.current); setBusy('');
        }
      }, 1500);
    } catch (err) {
      setBusy(''); toast.push(err.message || 'Could not start generation', 'error');
    }
  }, [session, toast]);

  const download = useCallback(() => {
    const url = result?.imageUrl || photo?.url;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = `redlook-virtual-trial.${result?.imageUrl ? 'png' : 'jpg'}`;
    document.body.appendChild(a); a.click(); a.remove();
  }, [result, photo]);

  const addToCart = useCallback(() => {
    if (!selected) return;
    addItem(selected);
    toast.push(`${selected.name} added to cart`, 'success');
  }, [selected, addItem, toast]);

  // ---- Render --------------------------------------------------------------
  // Admin turned the feature off → storefront shows the "Coming Soon" page.
  if (config && config.enabled === false) {
    return <ComingSoon onNavigate={onNavigate} />;
  }

  const providerPending = config && config.provider_connected === false;
  const filtered = products.filter((p) =>
    (activeCat === 'all' || p.category === activeCat) &&
    (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="rl-maroon-stage relative rounded-2xl overflow-hidden px-6 py-6 mb-6">
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.3em] uppercase" style={{ color: 'var(--lux-gold-soft)' }}>Redlook Virtual Trial Room</div>
            <h1 className="font-luxury text-2xl sm:text-3xl text-amber-50">Try Before You Buy</h1>
          </div>
          {session && (
            <button onClick={resetAll} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg" style={{ background: 'rgba(224,176,74,0.16)', border: '1px solid rgba(224,176,74,0.4)', color: '#f0d79a' }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete my session
            </button>
          )}
        </div>
      </div>

      {providerPending && (
        <div className="mb-6 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>The AI try-on engine isn't connected yet, so generated previews show a placeholder. Everything else — camera, body detection, product selection, and add-to-cart — is fully working. Connect a provider to enable real try-on images.</span>
        </div>
      )}

      {!photo ? (
        // ---- Intro / capture ------------------------------------------------
        <div className="max-w-2xl mx-auto">
          {mode !== 'camera' ? (
            <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8">
              <h2 className="font-luxury text-xl mb-2" style={{ color: 'var(--lux-maroon-deep)' }}>Welcome — see yourself in Redlook</h2>
              <p className="text-sm text-stone-500 mb-4">Use your webcam or upload a photo, then try sarees and suits from our collection on yourself.</p>
              <div className="rounded-xl bg-stone-50 dark:bg-slate-900/40 border border-stone-200 dark:border-slate-700 p-4 text-xs text-stone-600 dark:text-slate-300 space-y-1.5 mb-4">
                <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--lux-maroon)' }}><ShieldCheck className="w-4 h-4" /> Your privacy</div>
                <p>Your photo is sent to our server only to generate the preview, stored privately, auto-deleted after a short time, and never used to train models or shown to anyone else. No video is recorded. You can delete your session anytime.</p>
              </div>
              <label className="flex items-start gap-2 text-sm text-stone-700 dark:text-slate-200 mb-5 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>I understand and consent to my photo being processed to generate a virtual try-on preview.</span>
              </label>
              {cameraError && <div className="text-xs text-rose-600 mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {cameraError}</div>}
              <div className="flex flex-col sm:flex-row gap-3">
                <button disabled={!consent} onClick={() => startCamera('user')}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
                  <Camera className="w-4 h-4" /> Use Webcam
                </button>
                <label className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-semibold border ${consent ? 'cursor-pointer hover:bg-stone-50 dark:hover:bg-slate-700' : 'opacity-50 pointer-events-none'}`} style={{ borderColor: 'var(--lux-gold)', color: 'var(--lux-maroon)' }}>
                  <Upload className="w-4 h-4" /> Upload Photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!consent} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
                </label>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4">
              <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-[3/4]" style={{ border: '2px solid var(--lux-gold)' }}>
                <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-center gap-3 mt-4">
                <button onClick={() => { stopCamera(); setMode(null); }} className="px-4 py-2.5 rounded-full border border-stone-300 dark:border-slate-600 text-sm font-semibold">Cancel</button>
                <button onClick={capturePhoto} className="px-6 py-2.5 rounded-full text-white font-semibold inline-flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
                  <Camera className="w-4 h-4" /> Capture
                </button>
                <button onClick={() => startCamera(facing === 'user' ? 'environment' : 'user')} className="px-4 py-2.5 rounded-full border border-stone-300 dark:border-slate-600 text-sm font-semibold inline-flex items-center gap-1.5">
                  <SwitchCamera className="w-4 h-4" /> Flip
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        // ---- Three-column trial workspace ----------------------------------
        <div className="grid lg:grid-cols-3 gap-5">
          {/* LEFT — your photo + pose overlay */}
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4">
            <div className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: 'var(--lux-maroon)' }}>You</div>
            <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-[3/4]" style={{ border: '1px solid rgba(200,155,60,0.4)' }}>
              <img ref={photoImgRef} src={photo.url} alt="Your photo" className="absolute inset-0 w-full h-full object-cover" />
              <canvas ref={poseCanvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
              {pose.status === 'detecting' && <span className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/50 text-amber-100">Detecting body…</span>}
              {pose.status === 'done' && <span className="absolute top-2 left-2 text-[10px] px-2 py-1 rounded bg-black/50 text-amber-100 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Body detected</span>}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={resetAll} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 dark:border-slate-600 text-sm font-semibold">
                <RefreshCw className="w-4 h-4" /> Retake
              </button>
              {busy === 'uploading' && <span className="inline-flex items-center gap-1 text-xs text-stone-500 px-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</span>}
            </div>
          </div>

          {/* CENTER — try-on preview */}
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--lux-maroon)' }}>Preview</div>
              {result?.imageUrl && (
                <button onClick={() => setShowAfter((s) => !s)} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--lux-maroon)' }}>
                  {showAfter ? 'Show original' : 'Show try-on'}
                </button>
              )}
            </div>
            <div className="relative rounded-xl overflow-hidden bg-stone-900 aspect-[3/4] flex items-center justify-center" style={{ border: '1px solid rgba(200,155,60,0.4)' }}>
              {busy === 'generating' ? (
                <div className="text-center text-amber-100">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2" />
                  <div className="text-sm">Generating your look…</div>
                  <div className="w-40 h-1.5 bg-white/20 rounded-full mt-3 mx-auto overflow-hidden"><div className="h-full" style={{ width: `${progress}%`, background: 'var(--lux-gold-soft)' }} /></div>
                </div>
              ) : result?.imageUrl ? (
                <img src={showAfter ? result.imageUrl : photo.url} alt="Virtual try-on" className="absolute inset-0 w-full h-full object-cover" />
              ) : result?.placeholder ? (
                <div className="absolute inset-0">
                  <img src={photo.url} alt="Your photo" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4" style={{ background: 'rgba(42,8,16,0.55)' }}>
                    <Sparkles className="w-7 h-7 mb-2" style={{ color: 'var(--lux-gold-soft)' }} />
                    <div className="text-sm font-semibold text-amber-50">AI try-on preview isn't connected yet</div>
                    <p className="text-xs text-amber-50/80 mt-1 max-w-[220px]">Showing your photo with the selected garment below. Connect an AI provider to generate a realistic try-on.</p>
                    {selected && resolveImageUrl(selected.image) && (
                      <img src={resolveImageUrl(selected.image, 200)} alt={selected.name} className="mt-3 w-16 h-20 object-cover rounded border border-amber-200/50" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-amber-100/70 px-6">
                  <Sparkles className="w-7 h-7 mx-auto mb-2 opacity-70" />
                  <div className="text-sm">Select a saree or suit on the right to try it on.</div>
                </div>
              )}
            </div>
            {selected && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={addToCart} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' }}>
                  <ShoppingBag className="w-4 h-4" /> Add to Cart
                </button>
                <button onClick={download} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-stone-300 dark:border-slate-600 text-sm font-semibold">
                  <Download className="w-4 h-4" /> Download
                </button>
                <button onClick={() => onNavigate('product', { id: selected.id })} className="text-sm font-semibold ml-auto" style={{ color: 'var(--lux-maroon)' }}>View details →</button>
              </div>
            )}
          </div>

          {/* RIGHT — product selector */}
          <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col">
            <div className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: 'var(--lux-maroon)' }}>Choose an outfit</div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sarees, suits…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-900" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
              <button onClick={() => setActiveCat('all')} className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${activeCat === 'all' ? 'text-white' : 'border border-stone-300 dark:border-slate-600 text-stone-600'}`} style={activeCat === 'all' ? { background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' } : undefined}>All</button>
              {categories.map((c) => (
                <button key={c.id} onClick={() => setActiveCat(c.id)} className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${activeCat === c.id ? 'text-white' : 'border border-stone-300 dark:border-slate-600 text-stone-600'}`} style={activeCat === c.id ? { background: 'linear-gradient(135deg,#7a1f2a,#4a0f1a)' } : undefined}>{c.name}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1" style={{ maxHeight: '60vh' }}>
              {filtered.map((p) => (
                <button key={p.id} onClick={() => generate(p)} className={`text-left rounded-xl overflow-hidden border transition hover:-translate-y-0.5 ${selected?.id === p.id ? 'border-2' : 'border-stone-200 dark:border-slate-700'}`} style={selected?.id === p.id ? { borderColor: 'var(--lux-gold)' } : undefined}>
                  <div className="relative aspect-[3/4] bg-stone-100">
                    {resolveImageUrl(p.image) ? <img src={resolveImageUrl(p.image, 300)} alt={p.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <div className="absolute inset-0 flex items-center justify-center text-3xl">{p.image}</div>}
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-semibold truncate" style={{ color: 'var(--lux-maroon-deep)' }}>{p.name}</div>
                    <div className="text-xs text-stone-500">{formatCurrency(p.price)}</div>
                    <div className="mt-1 text-[10px] font-semibold inline-flex items-center gap-1" style={{ color: 'var(--lux-maroon)' }}><Sparkles className="w-3 h-3" /> Try this</div>
                  </div>
                </button>
              ))}
              {!filtered.length && <div className="col-span-2 text-center text-xs text-stone-400 py-8">No products match.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
