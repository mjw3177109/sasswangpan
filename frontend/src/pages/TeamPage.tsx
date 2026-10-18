import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  Bell,
  CircleUserRound,
  FilePlus2,
  FileText,
  FolderPlus,
  LayoutGrid,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'

import { MarkdownPreview } from '../lib/MarkdownPreview'
import { SelectMenu } from '../components/ui/SelectMenu'
import {
  acceptInvitation,
  changeMemberRole,
  collaborationUrl,
  createComment,
  createTeam,
  createTeamDocument,
  createTeamFolder,
  getTeamDocument,
  inviteMember,
  listActivity,
  listComments,
  listMembers,
  listNotifications,
  listTeamDocuments,
  listTeamFolders,
  listTeams,
  markNotificationRead,
  removeMember,
  resolveComment,
  updateTeamDocument,
  type ActivityItem,
  type NotificationItem,
  type Team,
  type TeamComment,
  type TeamDocument,
  type TeamFolder,
  type TeamMember,
  type TeamRole,
} from '../services/team'

type Panel = 'members' | 'comments' | 'notifications' | 'activity'
type Cursor = { offset: number; line: number; column: number }
type Selection = { start: number; end: number }
type Presence = {
  user_id: string
  name: string
  email: string
  role: TeamRole
  cursor?: Cursor | null
  selection?: Selection | null
}
type ConnectionState = 'offline' | 'connecting' | 'online' | 'conflict'
type CreateDialog = { kind: 'team' | 'folder' | null; value: string }

const roleLabel: Record<TeamRole, string> = {
  owner: '所有者',
  admin: '管理员',
  editor: '编辑者',
  viewer: '只读成员',
}

const memberRoleOptions = [
  { value: 'viewer', label: '只读' },
  { value: 'editor', label: '编辑' },
  { value: 'admin', label: '管理员' },
]

function TeamCreateDialog({
  dialog,
  onChange,
  onClose,
  onSubmit,
}: {
  dialog: CreateDialog
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  if (!dialog.kind) return null
  const isTeam = dialog.kind === 'team'
  return (
    <div className="team-dialog-layer" role="dialog" aria-modal="true" aria-label={isTeam ? '新建团队' : '新建共享文件夹'}>
      <button className="team-dialog-backdrop" aria-label="关闭" onClick={onClose} />
      <form className="team-dialog-card" onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit() }}>
        <div className="team-dialog-icon">{isTeam ? <Users /> : <FolderPlus />}</div>
        <button className="team-dialog-close" type="button" aria-label="关闭" onClick={onClose}><X /></button>
        <small>{isTeam ? 'WORKSPACE' : 'SHARED FOLDER'}</small>
        <h2>{isTeam ? '创建新的团队空间' : '新建共享文件夹'}</h2>
        <p>{isTeam ? '成员、文档、评论和实时协作都会集中在这个工作区。' : '用文件夹整理团队共享文档，所有有权限的成员都能看到。'}</p>
        <input
          autoFocus
          aria-label={isTeam ? '团队名称' : '共享文件夹名称'}
          value={dialog.value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={isTeam ? '例如：产品设计团队' : '例如：产品需求'}
          maxLength={120}
        />
        <div className="team-dialog-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button className="primary" type="submit" disabled={!dialog.value.trim()}>{isTeam ? '创建团队' : '创建文件夹'}</button>
        </div>
      </form>
    </div>
  )
}

export function TeamPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [folders, setFolders] = useState<TeamFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [documents, setDocuments] = useState<TeamDocument[]>([])
  const [activeId, setActiveId] = useState('')
  const [active, setActive] = useState<TeamDocument | null>(null)
  const [comments, setComments] = useState<TeamComment[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [presence, setPresence] = useState<Presence[]>([])
  const [panel, setPanel] = useState<Panel>('members')
  const [comment, setComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, 'owner'>>('viewer')
  const [inviteLink, setInviteLink] = useState('')
  const [status, setStatus] = useState<ConnectionState>('offline')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [createDialog, setCreateDialog] = useState<CreateDialog>({ kind: null, value: '' })

  const wsRef = useRef<WebSocket | null>(null)
  const activeRef = useRef<TeamDocument | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const dirtyRef = useRef(false)

  const selectedTeam = useMemo(() => teams.find((team) => team.id === teamId), [teams, teamId])
  const canEdit = Boolean(selectedTeam && selectedTeam.role !== 'viewer')
  const canAdmin = Boolean(selectedTeam && ['owner', 'admin'].includes(selectedTeam.role))
  const unreadCount = notifications.filter((item) => !item.read_at).length
  const visibleDocuments = useMemo(() => documents.filter((document) => {
    if (selectedFolder && document.folder_id !== selectedFolder) return false
    if (filter.trim() && !document.title.toLowerCase().includes(filter.trim().toLowerCase())) return false
    return true
  }), [documents, selectedFolder, filter])
  const workspaceOptions = useMemo(() => teams.map((team) => ({
    value: team.id,
    label: team.name,
    description: roleLabel[team.role],
  })), [teams])
  const folderOptions = useMemo(() => [
    { value: '', label: '全部文件夹' },
    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
  ], [folders])
  const documentFolderOptions = useMemo(() => [
    { value: '', label: '未归档' },
    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
  ], [folders])

  const reloadTeams = useCallback(async () => {
    const response = await listTeams()
    setTeams(response.data)
    setTeamId((current) => current || response.data[0]?.id || '')
  }, [])

  useEffect(() => {
    let cancelled = false
    void listTeams()
      .then((response) => {
        if (cancelled) return
        setTeams(response.data)
        setTeamId((current) => current || response.data[0]?.id || '')
      })
      .catch(() => { if (!cancelled) setError('团队列表加载失败') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const token = searchParams.get('invite')
    if (!token) return
    void acceptInvitation(token)
      .then(async () => {
        setSearchParams({}, { replace: true })
        await reloadTeams()
      })
      .catch(() => setError('邀请链接无效、已使用或已经过期'))
  }, [searchParams, setSearchParams, reloadTeams])

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    void Promise.all([
      listMembers(teamId),
      listTeamFolders(teamId),
      listTeamDocuments(teamId),
      listActivity(teamId),
      listNotifications(),
    ]).then(([memberResponse, folderResponse, documentResponse, activityResponse, notificationResponse]) => {
      if (cancelled) return
      setMembers(memberResponse.data)
      setFolders(folderResponse.data)
      setDocuments(documentResponse.data)
      setActivity(activityResponse.data)
      setNotifications(notificationResponse.data)
      setActiveId((current) => current && documentResponse.data.some((item) => item.id === current)
        ? current
        : documentResponse.data[0]?.id || '')
    }).catch(() => { if (!cancelled) setError('团队数据加载失败') })
    return () => { cancelled = true }
  }, [teamId])

  useEffect(() => {
    if (!teamId || !activeId) {
      queueMicrotask(() => setActive(null))
      return
    }
    let cancelled = false
    void getTeamDocument(teamId, activeId)
      .then((response) => {
        if (cancelled) return null
        dirtyRef.current = false
        setActive(response.data)
        activeRef.current = response.data
        return listComments(teamId, activeId)
      })
      .then((response) => { if (!cancelled && response) setComments(response.data) })
      .catch(() => { if (!cancelled) setError('团队文档加载失败') })
    return () => { cancelled = true }
  }, [teamId, activeId])

  useEffect(() => {
    if (!teamId || !activeId) return
    let disposed = false
    let pingTimer: number | null = null
    let reconnectTimer: number | null = null

    const connect = () => {
      if (disposed) return
      queueMicrotask(() => setStatus('connecting'))
      const websocket = new WebSocket(collaborationUrl(teamId, activeId))
      wsRef.current = websocket

      websocket.onopen = () => {
        if (pingTimer !== null) window.clearInterval(pingTimer)
        pingTimer = window.setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) websocket.send(JSON.stringify({ type: 'ping' }))
        }, 20_000)
      }
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'snapshot') {
          setStatus('online')
          if (!dirtyRef.current) {
            setActive(message.document)
            activeRef.current = message.document
          }
          setPresence(message.presence ?? [])
        } else if (message.type === 'document.updated') {
          dirtyRef.current = false
          setStatus('online')
          setActive(message.document)
          activeRef.current = message.document
          setDocuments((current) => current.map((doc) => doc.id === message.document.id ? { ...doc, ...message.document } : doc))
        } else if (message.type === 'conflict') {
          dirtyRef.current = false
          setStatus('conflict')
          setActive(message.document)
          activeRef.current = message.document
        } else if (message.type === 'presence.join' || message.type === 'presence.update') {
          setPresence((current) => [...current.filter((item) => item.user_id !== message.user_id), message])
        } else if (message.type === 'presence.leave') {
          setPresence((current) => current.filter((item) => item.user_id !== message.user_id))
        }
      }
      websocket.onerror = () => {
        if (websocket.readyState < WebSocket.CLOSING) websocket.close()
      }
      websocket.onclose = () => {
        if (pingTimer !== null) { window.clearInterval(pingTimer); pingTimer = null }
        if (wsRef.current === websocket) wsRef.current = null
        if (disposed) return
        setStatus('offline')
        reconnectTimer = window.setTimeout(connect, 1_500)
      }
    }

    connect()
    return () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (pingTimer !== null) window.clearInterval(pingTimer)
      const websocket = wsRef.current
      if (websocket) websocket.close()
      wsRef.current = null
    }
  }, [teamId, activeId])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
  }, [])

  const edit = (patch: Partial<TeamDocument>) => {
    if (!active || !canEdit) return
    const next = { ...active, ...patch }
    dirtyRef.current = true
    setActive(next)
    activeRef.current = next
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      const current = activeRef.current
      if (!current) return
      const socket = wsRef.current
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'update',
          expected_version: current.version,
          title: current.title,
          content: current.content,
        }))
        return
      }
      void updateTeamDocument(teamId, current.id, {
        version: current.version,
        title: current.title,
        content: current.content,
        folder_id: current.folder_id,
      }).then((response) => {
        dirtyRef.current = false
        setActive(response.data)
        activeRef.current = response.data
      }).catch(() => setStatus('conflict'))
    }, 800)
  }

  const sendPresence = (textarea: HTMLTextAreaElement) => {
    const socket = wsRef.current
    if (socket?.readyState !== WebSocket.OPEN) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = textarea.value.slice(0, start)
    const rows = before.split('\n')
    socket.send(JSON.stringify({
      type: 'presence',
      cursor: { offset: start, line: rows.length, column: (rows.at(-1)?.length ?? 0) + 1 },
      selection: { start, end },
    }))
  }

  const submitCreateDialog = async () => {
    const name = createDialog.value.trim()
    if (!name) return
    try {
      if (createDialog.kind === 'team') {
        const response = await createTeam(name)
        await reloadTeams()
        setTeamId(response.data.id)
        setActiveId('')
      } else if (createDialog.kind === 'folder' && teamId && canEdit) {
        const response = await createTeamFolder(teamId, name)
        setFolders((current) => [...current, response.data])
        setSelectedFolder(response.data.id)
      }
      setCreateDialog({ kind: null, value: '' })
    } catch {
      setError(createDialog.kind === 'team' ? '创建团队失败' : '创建文件夹失败')
    }
  }

  const addDoc = async () => {
    if (!teamId || !canEdit) return
    const response = await createTeamDocument(teamId, '未命名团队文档', selectedFolder || null)
    setDocuments((current) => [response.data, ...current])
    setActiveId(response.data.id)
  }

  const sendInvite = async () => {
    if (!teamId || !inviteEmail.trim()) return
    try {
      const response = await inviteMember(teamId, inviteEmail.trim(), inviteRole)
      setInviteLink(`${location.origin}/teams?invite=${encodeURIComponent(response.data.token)}`)
      setInviteEmail('')
    } catch {
      setError('邀请发送失败，请检查邮箱或权限')
    }
  }

  const sendComment = async (parentId: string | null = null, body = comment) => {
    if (!teamId || !activeId || !body.trim()) return
    const response = await createComment(teamId, activeId, body.trim(), parentId)
    setComments((current) => [...current, response.data])
    if (parentId === null) setComment('')
    else { setReplyingTo(null); setReplyText('') }
  }

  const connectionState = !activeId ? 'idle' : status
  const connectionText = !activeId
    ? '选择文档后开始实时协作'
    : status === 'online'
      ? `${presence.length} 人在线`
      : status === 'conflict'
        ? '版本冲突，请基于最新版本继续'
        : status === 'connecting'
          ? '正在连接协作服务…'
          : '网络暂不可用，正在自动重连…'

  if (!teams.length) {
    return (
      <>
        <div className="team-empty-modern">
          <div className="team-empty-logo"><Sparkles /></div>
          <small>MOFAN TEAM</small>
          <h1>把协作放到一个真正的工作区里</h1>
          <p>共享文档、成员权限、评论、通知和实时编辑都集中在这里。</p>
          <button onClick={() => setCreateDialog({ kind: 'team', value: '' })}><Plus />创建第一个团队</button>
          <Link to="/app">返回个人空间</Link>
        </div>
        <TeamCreateDialog dialog={createDialog} onChange={(value) => setCreateDialog((current) => ({ ...current, value }))} onClose={() => setCreateDialog({ kind: null, value: '' })} onSubmit={() => void submitCreateDialog()} />
      </>
    )
  }

  return (
    <div className="team-shell team-shell-v2">
      <aside className="team-sidebar team-sidebar-v2">
        <div className="team-brand team-brand-v2">
          <b>墨</b>
          <div><strong>墨帆团队</strong><small>Workspace</small></div>
          <button aria-label="更多工作区设置"><MoreHorizontal /></button>
        </div>

        <div className="team-workspace-switcher">
          <label>当前工作区</label>
          <SelectMenu
            ariaLabel="当前工作区"
            className="team-workspace-select"
            value={teamId}
            options={workspaceOptions}
            leadingIcon={<LayoutGrid />}
            onChange={(value) => { setTeamId(value); setActiveId(''); setSelectedFolder('') }}
          />
          <div className="team-role-line"><ShieldCheck />{selectedTeam ? roleLabel[selectedTeam.role] : ''}</div>
          <button className="team-new-workspace" onClick={() => setCreateDialog({ kind: 'team', value: '' })}><Plus />新建团队空间</button>
        </div>

        <div className="team-nav-section">
          <div className="team-section-heading">
            <div><span>共享文档</span><em>{documents.length}</em></div>
            <div>
              <button title="新建共享文件夹" disabled={!canEdit} onClick={() => setCreateDialog({ kind: 'folder', value: '' })}><FolderPlus /></button>
              <button title="新建共享文档" disabled={!canEdit} onClick={() => void addDoc()}><FilePlus2 /></button>
            </div>
          </div>
          <div className="team-search"><Search /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索共享文档" /></div>
          <SelectMenu
            ariaLabel="共享文件夹筛选"
            className="team-folder-filter team-compact-select"
            value={selectedFolder}
            options={folderOptions}
            onChange={setSelectedFolder}
          />
          <div className="team-doc-list team-doc-list-v2">
            {visibleDocuments.map((document) => (
              <button className={document.id === activeId ? 'active' : ''} key={document.id} onClick={() => setActiveId(document.id)}>
                <span className="team-doc-icon"><FileText /></span>
                <span><strong>{document.title}</strong><small>v{document.version} · {new Date(document.updated_at).toLocaleDateString()}</small></span>
              </button>
            ))}
            {!visibleDocuments.length && <div className="team-list-empty">这个视图还没有文档</div>}
          </div>
        </div>
        <Link className="back-personal back-personal-v2" to="/app">← 返回个人空间</Link>
      </aside>

      <main className="team-main team-main-v2">
        <header className="team-top team-top-v2">
          <div className="team-top-title">
            <small>{selectedTeam?.name}</small>
            <strong>{active?.title || '团队文档中心'}</strong>
          </div>
          <div className="team-top-actions">
            <span className={`collab-status collab-status-v2 ${connectionState}`}>{connectionState === 'online' ? <Wifi /> : connectionState === 'idle' ? <Radio /> : <WifiOff />}{connectionText}</span>
            <div className="presence-list presence-list-v2">
              {presence.slice(0, 5).map((item) => <span key={item.user_id} title={`${item.name} · ${roleLabel[item.role]}`}>{item.name.slice(0, 2).toUpperCase()}</span>)}
            </div>
            <button className="team-share-button" onClick={() => setPanel('members')}><Users />成员</button>
          </div>
        </header>

        {active ? (
          <section className="team-editor team-editor-v2">
            <div className="team-document-bar">
              <div>
                <input aria-label="团队文档标题" value={active.title} disabled={!canEdit} onChange={(event) => edit({ title: event.target.value })} />
                <span>{canEdit ? '自动保存 · 实时同步' : '只读模式'}</span>
              </div>
              <SelectMenu
                ariaLabel="团队文档文件夹"
                className="team-document-folder-select team-compact-select"
                value={active.folder_id ?? ''}
                options={documentFolderOptions}
                disabled={!canEdit}
                menuAlign="right"
                onChange={(value) => edit({ folder_id: value || null })}
              />
            </div>
            <div className="team-editor-grid">
              <div className="team-edit-pane team-edit-pane-v2">
                <div className="team-pane-label">MARKDOWN</div>
                <textarea
                  aria-label="团队文档正文"
                  value={active.content ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => edit({ content: event.target.value })}
                  onSelect={(event) => sendPresence(event.currentTarget)}
                />
              </div>
              <article className="team-preview team-preview-v2">
                <div className="team-pane-label">实时预览</div>
                <div className="paper"><MarkdownPreview markdown={active.content ?? ''} /></div>
              </article>
            </div>
          </section>
        ) : (
          <div className="team-no-doc team-no-doc-v2">
            <div><FilePlus2 /></div><strong>选择或创建一篇共享文档</strong><span>文档会实时同步给同一工作区中的成员。</span>
            {canEdit && <button onClick={() => void addDoc()}><Plus />新建共享文档</button>}
          </div>
        )}
      </main>

      <aside className="team-panel team-panel-v2">
        <div className="team-panel-header">
          <div><small>COLLABORATION</small><strong>协作中心</strong></div>
          <CircleUserRound />
        </div>
        <nav className="team-panel-tabs">
          <button className={panel === 'members' ? 'active' : ''} onClick={() => setPanel('members')}><Users /><span>成员</span></button>
          <button className={panel === 'comments' ? 'active' : ''} onClick={() => setPanel('comments')}><MessageSquare /><span>评论</span></button>
          <button className={panel === 'notifications' ? 'active' : ''} onClick={() => setPanel('notifications')}><Bell /><span>通知</span>{unreadCount > 0 && <em>{unreadCount}</em>}</button>
          <button className={panel === 'activity' ? 'active' : ''} onClick={() => setPanel('activity')}><Activity /><span>动态</span></button>
        </nav>
        {error && <div className="team-error">{error}</div>}
        <div className="team-panel-body team-panel-body-v2">
          {panel === 'members' && (
            <>
              <div className="team-panel-section-title"><span>成员管理</span><small>{members.length} 人</small></div>
              {canAdmin && (
                <div className="invite-box invite-box-v2">
                  <input placeholder="成员邮箱" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
                  <SelectMenu
                    ariaLabel="邀请成员角色"
                    className="team-role-select team-compact-select"
                    value={inviteRole}
                    options={memberRoleOptions}
                    onChange={(value) => setInviteRole(value as Exclude<TeamRole, 'owner'>)}
                  />
                  <button onClick={() => void sendInvite()}><Send />发送邀请</button>
                  {inviteLink && <code>{inviteLink}</code>}
                </div>
              )}
              <div className="team-member-list">
                {members.map((member) => (
                  <div className="member-row member-row-v2" key={member.id}>
                    <span className="member-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
                    <div><strong>{member.name}</strong><span>{member.email}</span></div>
                    {canAdmin && member.role !== 'owner' ? (
                      <div className="member-controls">
                        <SelectMenu
                          ariaLabel={`${member.name} 的角色`}
                          className="member-role-select team-compact-select"
                          value={member.role}
                          options={memberRoleOptions}
                          onChange={async (value) => {
                            await changeMemberRole(teamId, member.id, value as Exclude<TeamRole, 'owner'>)
                            setMembers((await listMembers(teamId)).data)
                          }}
                        />
                        <button title="移除成员" onClick={async () => {
                          if (!window.confirm('移除该成员？')) return
                          await removeMember(teamId, member.id)
                          setMembers((await listMembers(teamId)).data)
                        }}><X /></button>
                      </div>
                    ) : <em>{roleLabel[member.role]}</em>}
                  </div>
                ))}
              </div>
            </>
          )}

          {panel === 'comments' && (
            <>
              <div className="team-panel-section-title"><span>文档评论</span><small>{comments.length} 条</small></div>
              {activeId ? (
                <div className="comment-compose comment-compose-v2">
                  <textarea placeholder="写下评论，使用 @邮箱 提醒成员" value={comment} onChange={(event) => setComment(event.target.value)} />
                  <button onClick={() => void sendComment()} disabled={!comment.trim()}>发送评论</button>
                </div>
              ) : <div className="team-panel-empty">选择文档后即可评论</div>}
              {comments.map((item) => (
                <div className={`comment-row comment-row-v2${item.resolved_at ? ' resolved' : ''}`} key={item.id}>
                  <div className="comment-head"><span className="member-avatar small">{item.author.name.slice(0, 2).toUpperCase()}</span><div><strong>{item.author.name}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div></div>
                  <p>{item.body}</p>
                  <div className="comment-actions">
                    <button onClick={() => { setReplyingTo(item.id); setReplyText('') }}>回复</button>
                    <button onClick={async () => {
                      const response = await resolveComment(teamId, activeId, item.id, !item.resolved_at)
                      setComments((current) => current.map((commentItem) => commentItem.id === item.id ? response.data : commentItem))
                    }}>{item.resolved_at ? '重新打开' : '解决'}</button>
                  </div>
                  {replyingTo === item.id && (
                    <div className="comment-reply-box"><input autoFocus value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder={`回复 ${item.author.name}`} /><button onClick={() => void sendComment(item.id, replyText)}>发送</button><button onClick={() => setReplyingTo(null)}>取消</button></div>
                  )}
                </div>
              ))}
            </>
          )}

          {panel === 'notifications' && (
            <>
              <div className="team-panel-section-title"><span>通知中心</span><small>{unreadCount} 未读</small></div>
              {notifications.map((item) => (
                <button className={`notice-row notice-row-v2 ${item.read_at ? 'read' : ''}`} key={item.id} onClick={async () => {
                  if (item.read_at) return
                  const response = await markNotificationRead(item.id)
                  setNotifications((current) => current.map((notice) => notice.id === item.id ? response.data : notice))
                }}><span className="notice-dot" /><div><strong>{item.kind}</strong><span>{new Date(item.created_at).toLocaleString()}</span></div></button>
              ))}
              {!notifications.length && <div className="team-panel-empty">暂时没有通知</div>}
            </>
          )}

          {panel === 'activity' && (
            <>
              <div className="team-panel-section-title"><span>团队动态</span><small>最近活动</small></div>
              {activity.map((item) => (
                <div className="activity-row activity-row-v2" key={item.id}><span className="activity-icon"><Settings /></span><div><strong>{item.action}</strong><span>{item.entity_type} · {new Date(item.created_at).toLocaleString()}</span></div></div>
              ))}
              {!activity.length && <div className="team-panel-empty">暂无团队动态</div>}
            </>
          )}
        </div>
      </aside>

      <TeamCreateDialog dialog={createDialog} onChange={(value) => setCreateDialog((current) => ({ ...current, value }))} onClose={() => setCreateDialog({ kind: null, value: '' })} onSubmit={() => void submitCreateDialog()} />
    </div>
  )
}
