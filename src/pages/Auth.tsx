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
import logo from '@/assets/hobbeast-logo.png';

type AuthView = 'login' | 'register' | 'verify' | 'forgot';

const Auth = () => {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { signIn, signUp, user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectTo = searchParams.get('redirect') || '/';

  useEffect(() => {
    if (user) navigate(redirectTo);
  }, [user, navigate, redirectTo]);

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
        if (error.message.includes('Email not confirmed')) {
          toast.error('Az e-mail címed még nincs megerősítve. Kérjük, ellenőrizd a postaládádat.');
        } else {
          toast.error(error.message);
        }
      } else {
        navigate(redirectTo);
      }
    } else if (view === 'register') {
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast.error(error.message);
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
    if (error) { toast.error('Érvénytelen vagy lejárt kód.'); }
    else { toast.success('E-mail sikeresen megerősítve!'); navigate(redirectTo); }
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
    <div className="flex min-h-screen">
      {/* Left branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden gradient-primary">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 h-64 w-64 rounded-full bg-primary-foreground/5 blur-3xl" />
          <div className="absolute bottom-20 right-10 h-80 w-80 rounded-full bg-primary-foreground/10 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Hobbeast" className="h-11 w-11 rounded-2xl" />
            <span className="font-display text-2xl font-bold">Hobbeast</span>
          </div>
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="font-display text-5xl font-bold leading-tight">Találd meg a<br />közösséged,<br />élj át élményeket</h1>
              <p className="text-lg text-primary-foreground/70 max-w-md">Fedezd fel a hobbi közösségeket a közeledben, szervezz programokat és találj barátokat.</p>
            </div>
            <div className="space-y-4">
              {features.map((feature, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.15 }}
                  className="flex items-center gap-4 rounded-2xl bg-primary-foreground/10 backdrop-blur-sm p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-foreground/20">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{feature.title}</p>
                    <p className="text-xs text-primary-foreground/60">{feature.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <p className="text-sm text-primary-foreground/40">© 2026 Hobbeast. Minden jog fenntartva.</p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <img src={logo} alt="Hobbeast" className="h-11 w-11 rounded-2xl" />
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
