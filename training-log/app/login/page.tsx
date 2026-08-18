import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import { supabaseServer } from '@/lib/supabase/server'

export default async function LoginPage() {
  const sb = await supabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (user) redirect('/')
  return <LoginForm />
}
