import { redirect } from 'next/navigation'
import { currentUser, type CurrentUser } from './auth'

/** Usa em toda página e server action. Sem sessão válida, ninguém passa. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser()
  if (!user) redirect('/login')
  return user
}
