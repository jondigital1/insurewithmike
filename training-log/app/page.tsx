import { redirect } from 'next/navigation'
import App from '@/components/App'
import { supabaseServer } from '@/lib/supabase/server'

export default async function Page() {
  const sb = await supabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/login')
  return <App userId={user.id} email={user.email ?? ''} />
}
