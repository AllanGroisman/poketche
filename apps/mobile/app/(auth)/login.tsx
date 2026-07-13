import { AuthForm } from '@/features/account/AuthForm';
import { signInWithEmail } from '@/services/auth';

export default function Login() {
  return (
    <AuthForm
      title="Entrar"
      cta="Entrar"
      onSubmit={async (email, password) => {
        await signInWithEmail(email, password);
      }}
      altText="Não tem conta?"
      altHref="/(auth)/sign-up"
      altLabel="Cadastre-se"
    />
  );
}
