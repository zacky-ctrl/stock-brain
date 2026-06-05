import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { tableTh, tableTd } from '@/lib/ui'
import { AssignUserForm } from './AssignUserForm'
import { RevokeButton } from './RevokeButton'
import type { CSSProperties } from 'react'

type UserRoleRow = {
  id: string
  email: string
  role: string
  is_active: boolean
  assigned_at: string
  assigned_by: string | null
}

type PendingUserRow = {
  id: string
  email: string
  created_at: string
}

const tdNum: CSSProperties = { ...tableTd, fontVariantNumeric: 'tabular-nums' }

export default async function UsersPage() {
  const supabase = createServerSupabaseClient()

  const [{ data: usersRaw, error: usersError }, { data: pendingRaw, error: pendingError }] = await Promise.all([
    supabase
      .from('user_roles')
      .select('id, email, role, is_active, assigned_at, assigned_by')
      .order('assigned_at', { ascending: false }),
    supabase.rpc('get_pending_users'),
  ])

  const users = (usersRaw ?? []) as UserRoleRow[]
  const pendingUsers = (pendingRaw ?? []) as PendingUserRow[]

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '900px' }}>
      <PageHeader
        title="User Access"
        subtitle="Assign roles to allow users to log in to Stock Brain"
      />

      <Card style={{ marginBottom: '2rem' }}>
        <SectionHeader title="Add User" />
        <AssignUserForm />
      </Card>

      {(usersError || pendingError) && (
        <Card style={{ marginBottom: '2rem', borderColor: 'var(--danger)' }}>
          <div style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            User access data could not be loaded.
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginTop: '0.4rem' }}>
            {(usersError?.message ?? pendingError?.message) ?? 'Unknown database error'}
          </div>
        </Card>
      )}

      {pendingUsers.length > 0 && (
        <>
          <SectionHeader title="Pending Approval" count={pendingUsers.length} />
          <Card style={{ marginBottom: '2rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Email</th>
                    <th style={tableTh}>Signed Up</th>
                    <th style={tableTh}>Assign Role</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={tableTd}>{u.email}</td>
                      <td style={tdNum}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={tableTd}>
                        <AssignUserForm defaultEmail={u.email} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <SectionHeader title="All Users" count={users.length} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '560px' }}>
          <thead>
            <tr>
              <th style={tableTh}>Email</th>
              <th style={tableTh}>Role</th>
              <th style={tableTh}>Status</th>
              <th style={tableTh}>Assigned At</th>
              <th style={tableTh} />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tableTd, color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                  No users yet. Add one above.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td style={tableTd}>{u.email}</td>
                <td style={tableTd}>
                  <Badge
                    variant={u.role === 'admin' ? 'danger' : u.role === 'manager' ? 'warning' : 'neutral'}
                    size="sm"
                    label={u.role}
                  />
                </td>
                <td style={tableTd}>
                  <Badge variant={u.is_active ? 'success' : 'neutral'} size="sm" label={u.is_active ? 'active' : 'revoked'} />
                </td>
                <td style={tdNum}>{new Date(u.assigned_at).toLocaleDateString()}</td>
                <td style={tableTd}>
                  {u.is_active && <RevokeButton email={u.email} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
