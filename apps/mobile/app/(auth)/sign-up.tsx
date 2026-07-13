import { Alert } from 'react-native';
import { router } from 'expo-router';
import { AuthForm } from '@/features/account/AuthForm';
import { signUpWithEmail } from '@/services/auth';

export default function SignUp() {
  return (
    <AuthForm
      title="Criar conta"
      cta="Cadastrar"
      hint="Você receberá um e-mail de confirmação antes do primeiro acesso."
      onSubmit={async (email, password) => {
        await signUpWithEmail(email, password);
        Alert.alert('Confirme seu e-mail', 'Enviamos um link de confirmação para ' + email);
        router.replace('/(auth)/login');
      }}
      altText="Já tem conta?"
      altHref="/(auth)/login"
      altLabel="Entrar"
    />
  );
}
