import { useRef, useState } from 'react';
import { View, Text, TextInput, type TextInputInstance, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'reset';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

if (googleWebClientId) {
  GoogleSignin.configure({ webClientId: googleWebClientId, iosClientId: googleIosClientId });
}

async function completeAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  fetch(`${process.env.EXPO_PUBLIC_WEB_URL}/api/auth/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  }).catch(() => {});
}

// Auth-screen top bar, mirroring the main app's BrandHeader (slate-900 bar,
// amber music-note tile + wordmark) with a back chevron.
function AuthHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View className="bg-slate-900" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-3 items-center justify-center">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View className="h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
            <Ionicons name="musical-notes" size={16} color="white" />
          </View>
          <Text className="text-sm font-semibold text-white">SingJam</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute left-4 top-0 bottom-0 justify-center"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color="#cbd5e1" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SignInScreen() {
  const { mode: initialMode } = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<Mode>(initialMode === 'signup' ? 'signup' : 'signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResetSent(false);
    setConfirmPassword('');
  }

  async function handleSubmit() {
    setError(null);

    if (mode === 'reset') {
      if (!email.trim()) { setError('Enter your email address.'); return; }
      setLoading(true);
      // Points at the web reset flow rather than a singjam:// route: the recovery
      // template builds the link from RedirectTo, and a custom-scheme link dead-ends
      // when the app isn't installed or the mail client won't linkify it. Swapping
      // this for a universal link later opens the app in place, same URL.
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${process.env.EXPO_PUBLIC_WEB_URL}/auth/confirm`,
      });
      setLoading(false);
      if (error) { setError(error.message); return; }
      setResetSent(true);
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: 'singjam://' } });
    if (error) setError(error.message);
    else if (mode === 'signup') completeAuth();
    setLoading(false);
  }

  async function handleAppleSignIn() {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token returned from Apple.');
      setLoading(true);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      setLoading(false);
      if (error) { setError(error.message); return; }
      completeAuth();
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') setError(e.message ?? 'Apple sign-in failed.');
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;
      const idToken = response.data.idToken;
      if (!idToken) throw new Error('No ID token returned from Google.');
      setLoading(true);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      setLoading(false);
      if (error) { setError(error.message); return; }
      completeAuth();
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code !== statusCodes.SIGN_IN_CANCELLED) setError('Google sign-in failed.');
      } else {
        setError('Google sign-in failed.');
      }
    }
  }

  if (mode === 'reset') {
    return (
      <View className="flex-1 bg-white">
      <AuthHeader />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text className="text-3xl font-bold text-slate-900 mb-2">Reset your password</Text>
          <Text className="text-slate-500 mb-8">
            Enter your email and we'll send you a reset link.
          </Text>

          {resetSent ? (
            <View className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6">
              <Text className="text-emerald-700 text-sm leading-5">
                If an account exists for <Text className="font-semibold">{email.trim()}</Text>, a
                password reset link is on its way. Check your spam folder if you don't see it within
                a couple of minutes.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Email</Text>
              <TextInput
                className="border border-slate-200 rounded-lg px-4 py-3 mb-4 text-slate-900"
                placeholder="you@example.com"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                autoFocus
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />

              {error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}

              <TouchableOpacity
                className="bg-amber-500 rounded-lg py-3 items-center mb-4"
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">Send reset link</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => switchMode('signin')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-center text-amber-600 text-sm">Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
    <AuthHeader />
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text className="text-3xl font-bold text-slate-900 mb-2">
          {mode === 'signin' ? 'Sign in to SingJam' : 'Create your SingJam account'}
        </Text>
        <Text className="text-slate-500 mb-8 leading-5">
          <Text className="font-semibold text-slate-700">Discover new music</Text> and{' '}
          <Text className="font-semibold text-slate-700">new friends</Text>. Totally{' '}
          <Text className="font-semibold text-slate-700">free</Text> — we'll only email you about{' '}
          <Text className="font-semibold text-slate-700">cool music stuff</Text> 😎 🎸🥁
        </Text>

        {googleWebClientId && (
          <TouchableOpacity
            className="flex-row items-center justify-center gap-2.5 border border-slate-200 rounded-lg py-3 mb-3"
            onPress={handleGoogleSignIn}
            disabled={loading}
          >
            <Image
              source={require('../../assets/google-g.png')}
              style={{ width: 18, height: 18 }}
            />
            <Text className="text-slate-700 font-medium">Continue with Google</Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={8}
            style={{ width: '100%', height: 44, marginBottom: 16 }}
            onPress={handleAppleSignIn}
          />
        )}

        {(googleWebClientId || Platform.OS === 'ios') && (
          <View className="flex-row items-center gap-3 mb-4">
            <View className="h-px flex-1 bg-slate-200" />
            <Text className="text-xs text-slate-400">or</Text>
            <View className="h-px flex-1 bg-slate-200" />
          </View>
        )}

        <Text className="text-sm font-medium text-slate-700 mb-1.5">Email</Text>
        <TextInput
          className="border border-slate-200 rounded-lg px-4 py-3 mb-4 text-slate-900"
          placeholder="you@example.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <View className="flex-row items-center justify-between mb-1.5">
          <Text className="text-sm font-medium text-slate-700">Password</Text>
          {mode === 'signin' && (
            <TouchableOpacity
              onPress={() => switchMode('reset')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-xs text-amber-600">Forgot password?</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput
          ref={passwordRef}
          className="border border-slate-200 rounded-lg px-4 py-3 mb-4 text-slate-900"
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType={mode === 'signup' ? 'next' : 'go'}
          submitBehavior={mode === 'signup' ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={() => (mode === 'signup' ? confirmRef.current?.focus() : handleSubmit())}
        />

        {mode === 'signup' && (
          <>
            <Text className="text-sm font-medium text-slate-700 mb-1.5">Confirm password</Text>
            <TextInput
              ref={confirmRef}
              className="border border-slate-200 rounded-lg px-4 py-3 mb-4 text-slate-900"
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
          </>
        )}

        {error && <Text className="text-red-600 text-sm mb-3">{error}</Text>}

        <TouchableOpacity
          className="bg-amber-500 rounded-lg py-3 items-center mb-4"
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-center text-slate-500 text-sm">
            {mode === 'signin' ? (
              <>No account? <Text className="text-amber-600">Create one</Text></>
            ) : (
              <>Already have an account? <Text className="text-amber-600">Sign in</Text></>
            )}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}
