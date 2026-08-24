import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle2, KeyRound, Heart, Users, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HobbeastMark } from '@/components/HobbeastMark';
import { sanitizeRedirectPath } from '@/lib/redirect';
import { mapAuthError } from '@/features/identity/authErrors';

type AuthView = 'login' | 'register' | 'verify' | 'forgot';

const Auth = () => {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { signIn, signUp, user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // P0 hardening (v1.7.4): sanitize the `redirect` query param — only allow
  // relative, single-slash, internal paths. See src/lib/redirect.ts + tests.
  // v1.7.6: extracted to pure helper so the behavior is characterization-tested.
  const rawRedirect = searchParams.get('redirect');
  const redirectTo = sanitizeRedirectPath(rawRedirect);

  useEffect(() => {
    if (user) navigate(registrationPending && !rawRedirect ? '/onboarding' : redirectTo);
  }, [user, navigate, rawRedirect, redirectTo, registrationPending]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (view === 'login') {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(mapAuthError(error).message);
      } else {
        navigate(redirectTo);
      }
    } else if (view === 'register') {
      setRegistrationPending(true);
      const { error } = await signUp(email, password, displayName);
      if (error) {
        setRegistrationPending(false);
        toast.error(mapAuthError(error).message);
      } else {
        setView('verify');
        setResendCooldown(60);
        toast.success('Megerősítő e-mail elküldve!');
      }
    }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length < 6) { toast.error('Kérjük, add meg a 6 jegyű kódot.'); return; }
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'signup' });
    if (error) { toast.error(mapAuthError(error).message); }
    else { toast.success('E-mail sikeresen megerősítve!'); navigate(rawRedirect ? redirectTo : '/onboarding'); }
    setVerifying(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) toast.error('Hiba az újraküldés során.');
    else { toast.success('Megerősítő e-mail újraküldve!'); setResendCooldown(60); }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Kérjük, add meg az e-mail címedet.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error('Hiba történt. Kérjük, próbáld újra később.');
    else toast.success('Jelszó-visszaállító e-mail elküldve!');
    setLoading(false);
  };

  const features = [
    { icon: Heart, title: 'Hobbi közösségek', desc: 'Találd meg az embereket, akik ugyanazt szeretik' },
    { icon: Users, title: 'Események szervezése', desc: 'Hirdess programokat és csatlakozz másokéhoz' },
    { icon: Sparkles, title: 'Személyre szabott', desc: 'Érdeklődés és lokáció alapján ajánlunk neked' },
  ];

  return (
    <div className="flex min-h-screen bg-[#f1eee5]">
      {/* Left branding */}
      <div className="relative hidden overflow-hidden bg-[#dfff62] lg:flex lg:w-[52%]">
        <div className="absolute inset-0">
          <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full border-[58px] border-[#183124]/10" />
          <div className="absolute -right-20 top-[18%] h-52 w-52 rotate-12 rounded-[3rem] bg-[#ff8f72]" />
          <div className="absolute -bottom-28 left-[38%] h-72 w-72 rounded-full bg-[#c9b7ff]" />
          <div className="absolute right-[7%] top-[33%] rotate-6 rounded-[1.5rem] bg-[#fffdf7] px-5 py-4 text-[#183124] shadow-xl">
            <span className="block text-[0.62rem] font-extrabold uppercase tracking-[0.14em]">Ma is történik valami</span>
            <span className="mt-1 block font-display text-lg font-extrabold">Találkozz élőben ✦</span>
          </div>
        </div>
        <div className="relative z-10 flex w-full flex-col justify-between p-12 text-[#183124] xl:p-16">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-[#fffdf7] p-1 shadow-soft"><HobbeastMark className="h-10 w-10" /></span>
            <span className="font-display text-2xl font-extrabold tracking-[-0.04em]">Hobbeast</span>
          </div>
          <div className="max-w-2xl space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em]">Az új kedvenc társaságod itt kezdődik</p>
              <h1 aria-label="Találd meg a te embereidet." className="font-display text-6xl font-extrabold leading-[0.88] tracking-[-0.065em] xl:text-7xl">Találd meg<br />a te<br /><span className="text-[#ff6948]">embereidet.</span></h1>
              <p className="max-w-md text-lg font-medium text-[#183124]/[0.68]">Fedezd fel a hobbi közösségeket a közeledben, szervezz programokat és találj barátokat.</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {features.map((feature, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.15 }}
                  className="flex items-center gap-3 rounded-[1.35rem] border border-[#183124]/10 bg-[#fffdf7]/70 p-3.5 backdrop-blur-sm xl:block">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#183124] text-[#dfff62]">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div className="xl:mt-4">
                    <p className="text-sm font-extrabold">{feature.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#183124]/[0.76]">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <p className="text-sm font-medium text-[#183124]/[0.7]">© 2026 Hobbeast. Minden jog fenntartva.</p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex flex-1 items-start justify-center bg-[#f1eee5] p-4 py-8 sm:items-center sm:p-6 lg:p-10 xl:p-14">
        <div className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-card p-6 shadow-[0_28px_80px_-44px_rgba(24,49,36,0.55)] sm:p-9 lg:p-10">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <HobbeastMark className="h-11 w-11" />
            <span className="font-display text-2xl font-bold">Hobbeast</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="w-full">

              {view === 'verify' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow">
                      <Mail className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h2 className="font-display text-2xl font-bold">E-mail megerősítése</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Küldtünk egy megerősítő e-mailt a(z) <span className="font-medium text-foreground">{email}</span> címre.</p>
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <div className="space-y-1 text-sm">
                        <p className="font-medium">Kétféleképpen erősítheted meg:</p>
                        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                          <li>Kattints az e-mailben kapott <strong>aktivációs linkre</strong></li>
                          <li>Vagy add meg a <strong>6 jegyű kódot</strong> alább</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-center block">Megerősítő kód</Label>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                        <InputOTPGroup>
                          {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button onClick={handleVerifyOtp} className="w-full h-12 rounded-xl gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition-opacity" disabled={verifying || otpCode.length < 6}>
                      {verifying ? 'Ellenőrzés...' : 'Kód megerősítése'}
                    </Button>
                  </div>
                  <Separator />
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">Nem kaptál e-mailt?</p>
                    <Button variant="outline" size="sm" onClick={handleResend} disabled={resendCooldown > 0 || loading} className="rounded-xl">
                      {resendCooldown > 0 ? `Újraküldés (${resendCooldown}s)` : 'E-mail újraküldése'}
                    </Button>
                  </div>
                  <button onClick={() => { setView('login'); setOtpCode(''); }} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-3.5 w-3.5" /> Vissza a bejelentkezéshez
                  </button>
                </div>
              )}

              {view === 'forgot' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow">
                      <KeyRound className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h2 className="font-display text-2xl font-bold">Elfelejtett jelszó</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Add meg az e-mail címedet és küldünk egy visszaállító linket.</p>
                  </div>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">E-mail</Label>
                      <Input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pelda@email.com" required className="h-12 rounded-xl" />
                    </div>
                    <Button type="submit" className="w-full h-12 rounded-xl gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition-opacity" disabled={loading}>
                      {loading ? 'Küldés...' : 'Visszaállító e-mail küldése'}
                    </Button>
                  </form>
                  <button onClick={() => setView('login')} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-3.5 w-3.5" /> Vissza a bejelentkezéshez
                  </button>
                </div>
              )}

              {(view === 'login' || view === 'register') && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="font-display text-2xl font-bold">{view === 'login' ? 'Üdv újra!' : 'Csatlakozz hozzánk!'}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{view === 'login' ? 'Jelentkezz be a Hobbeast fiókodba' : 'Hozd létre a Hobbeast fiókodat'}</p>
                  </div>

                  <Button variant="outline" className="w-full h-12 rounded-xl font-medium" disabled={loading} onClick={async () => {
                    setLoading(true);
                    // P0 (v1.7.4): use the current origin so OAuth returns to the
                    // domain the user actually signed in from (localhost, Lovable
                    // preview, custom domain), instead of a hardcoded Vercel URL.
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: `${window.location.origin}/`,
                        queryParams: {
                          access_type: 'offline',
                          prompt: 'consent',
                        },
                      },
                    });
                    if (error) {
                      toast.error(error.message);
                      setLoading(false);
                    }
                  }}>
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Folytatás Google fiókkal
                  </Button>

                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <span className="text-xs text-muted-foreground font-medium">vagy e-maillel</span>
                    <Separator className="flex-1" />
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {view === 'register' && (
                      <div className="space-y-2">
                        <Label htmlFor="displayName">Megjelenített név</Label>
                        <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Neved" required className="h-12 rounded-xl" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pelda@email.com" required className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Jelszó</Label>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="h-12 rounded-xl" />
                      {view === 'login' && (
                        <button type="button" onClick={() => setView('forgot')} className="text-xs text-muted-foreground hover:text-primary transition-colors">Elfelejtett jelszó?</button>
                      )}
                    </div>
                    <Button type="submit" className="w-full h-12 rounded-xl gradient-primary font-semibold text-primary-foreground shadow-glow hover:opacity-90 transition-opacity" disabled={loading}>
                      {loading ? 'Kérlek várj...' : view === 'login' ? 'Bejelentkezés' : 'Regisztráció'}
                    </Button>
                  </form>
                  <div className="text-center text-sm text-muted-foreground">
                    {view === 'login' ? 'Nincs fiókod?' : 'Már van fiókod?'}{' '}
                    <button onClick={() => setView(view === 'login' ? 'register' : 'login')} className="text-primary font-medium underline-offset-4 hover:underline">
                      {view === 'login' ? 'Regisztráció' : 'Bejelentkezés'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Auth;
