import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Dashboard from './src/screens/Dashboard';
import { API_BASE_URL } from './src/services/dashboardApi';

export default function App() {
  const [token, setToken] = useState(null);
  const [account, setAccount] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // On web this mirrors the frontend's local session. Native sign-in remains
    // in memory for the current app session.
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mediroute_access_token');
      if (saved) {
        setToken(saved);
        fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(setAccount).catch(() => localStorage.removeItem('mediroute_access_token'))
          .finally(() => setRestoring(false));
        return;
      }
    }
    setRestoring(false);
  }, []);

  const authenticate = async () => {
    if (!email.trim() || password.length < 10 || (registering && !name.trim())) {
      Alert.alert('Check your details', registering ? 'Enter your name, email and a password with at least 10 characters.' : 'Enter your email and password (at least 10 characters).');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/${registering ? 'register' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering ? { display_name: name.trim(), email: email.trim(), password } : { email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not sign in.');
      if (data.account.role !== 'USER') throw new Error('This mobile app is for user accounts. Sign in with a USER account.');
      setToken(data.access_token); setAccount(data.account);
      if (typeof localStorage !== 'undefined') localStorage.setItem('mediroute_access_token', data.access_token);
    } catch (err) { Alert.alert('Sign in failed', err.message); }
    finally { setBusy(false); }
  };

  const signOut = () => {
    setToken(null); setAccount(null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem('mediroute_access_token');
  };

  if (restoring) return <SafeAreaView style={s.center}><ActivityIndicator color="#059669" /></SafeAreaView>;
  if (token && account) return <Dashboard token={token} account={account} onSignOut={signOut} />;
  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
    <View style={s.authWrap}>
      <View style={s.brand}><View style={s.dot}/><Text style={s.eyebrow}>EMERGENCY RESPONSE</Text></View>
      <Text style={s.title}>MediRoute</Text>
      <Text style={s.subtitle}>Your emergency care, coordinated.</Text>
      <View style={s.card}>
        <Text style={s.cardTitle}>{registering ? 'Create your account' : 'Welcome back'}</Text>
        <Text style={s.muted}>Sign in to request help and track your response.</Text>
        {registering && <TextInput value={name} onChangeText={setName} placeholder="Full name" style={s.input} autoCapitalize="words" />}
        <TextInput value={email} onChangeText={setEmail} placeholder="Email address" style={s.input} keyboardType="email-address" autoCapitalize="none" />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" style={s.input} secureTextEntry />
        <TouchableOpacity style={s.primary} onPress={authenticate} disabled={busy}><Text style={s.primaryText}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setRegistering(!registering)}><Text style={s.link}>{registering ? 'Already have an account? Sign in' : 'New to MediRoute? Create an account'}</Text></TouchableOpacity>
      </View>
    </View>
  </SafeAreaView>;
}

const s = {
  safe:{flex:1,backgroundColor:'#f8fafc'}, center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f8fafc'},
  authWrap:{flex:1,justifyContent:'center',padding:22}, brand:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}, dot:{width:8,height:8,borderRadius:4,backgroundColor:'#059669'},
  eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.7,color:'#047857'}, title:{fontSize:34,fontWeight:'800',color:'#0f172a'}, subtitle:{fontSize:14,color:'#64748b',marginTop:5,marginBottom:28},
  card:{padding:20,borderRadius:20,borderWidth:1,borderColor:'#e2e8f0',backgroundColor:'#fff'}, cardTitle:{fontSize:20,fontWeight:'800',color:'#0f172a'}, muted:{fontSize:13,color:'#64748b',lineHeight:19,marginTop:5,marginBottom:14},
  input:{height:48,borderWidth:1,borderColor:'#e2e8f0',borderRadius:11,paddingHorizontal:13,marginTop:10,color:'#0f172a',backgroundColor:'#fff'}, primary:{height:48,borderRadius:11,backgroundColor:'#059669',alignItems:'center',justifyContent:'center',marginTop:16}, primaryText:{color:'#fff',fontWeight:'800'}, link:{textAlign:'center',color:'#047857',fontWeight:'700',fontSize:13,marginTop:17}
};
