import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, KeyRound, Mail } from 'lucide-react'
import { ApiError } from '../services/api'
import {
  loginAccount,
  loginWithEmailCode,
  registerAccount,
  requestEmailCode,
  resetPassword,
  type EmailCodePurpose,
} from '../services/auth'

interface Props {
  mode: 'login' | 'register' | 'forgot'
}

type LoginMethod = 'password' | 'code'

export function AuthPage({ mode }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [resetComplete, setResetComplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const codeMode = isRegister || isForgot || loginMethod === 'code'

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const purpose: EmailCodePurpose = isRegister ? 'register' : isForgot ? 'reset' : 'login'

  async function sendCode() {
    if (!email.trim() || countdown > 0 || sendingCode) return
    setError('')
    setSuccess('')
    setSendingCode(true)
    try {
      await requestEmailCode({ email: email.trim(), purpose })
      setCountdown(60)
      setSuccess('验证码已发送，请检查邮箱。')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '验证码发送失败，请稍后重试')
    } finally {
      setSendingCode(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (isForgot && password !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }
    setSubmitting(true)
    try {
      if (isRegister) {
        await registerAccount({ name, email, password, code })
        navigate('/app', { replace: true })
      } else if (isForgot) {
        await resetPassword({ email, code, new_password: password })
        setSuccess('密码已重置，请使用新密码登录。')
        setResetComplete(true)
      } else if (loginMethod === 'code') {
        await loginWithEmailCode({ email, code })
        navigate('/app', { replace: true })
      } else {
        await loginAccount({ email, password })
        navigate('/app', { replace: true })
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '连接服务器失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const heading = isRegister ? '创建你的墨帆空间' : isForgot ? '重置密码' : '登录墨帆'
  const description = isRegister
    ? '验证邮箱后建立个人知识空间，开始云端 Markdown 创作。'
    : isForgot
      ? '通过邮箱验证码确认身份并设置新密码。'
      : '继续你的文档、笔记与创作。'

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <div className="auth-logo">墨</div><strong>墨帆 Mofan</strong><span>从想法，到作品。</span>
      </div>
      <form className="auth-card auth-card-v2" onSubmit={submit}>
        <div className="auth-heading">
          <small>{isRegister ? 'CREATE ACCOUNT' : isForgot ? 'RESET PASSWORD' : 'WELCOME BACK'}</small>
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>

        {!isRegister && !isForgot && (
          <div className="auth-method-tabs" role="tablist" aria-label="登录方式">
            <button type="button" role="tab" aria-selected={loginMethod === 'password'} className={loginMethod === 'password' ? 'active' : ''} onClick={() => { setLoginMethod('password'); setError(''); setSuccess('') }}><KeyRound />密码登录</button>
            <button type="button" role="tab" aria-selected={loginMethod === 'code'} className={loginMethod === 'code' ? 'active' : ''} onClick={() => { setLoginMethod('code'); setError(''); setSuccess('') }}><Mail />验证码登录</button>
          </div>
        )}

        {isRegister && (
          <label>昵称<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字" /></label>
        )}
        <label>邮箱<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>

        {codeMode && (
          <label>邮箱验证码
            <div className="auth-code-row">
              <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} aria-label="邮箱验证码" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位验证码" />
              <button type="button" onClick={() => void sendCode()} disabled={!email.trim() || sendingCode || countdown > 0}>
                {sendingCode ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
              </button>
            </div>
          </label>
        )}

        {(isRegister || isForgot || (!isRegister && !isForgot && loginMethod === 'password')) && (
          <label>{isForgot ? '新密码' : '密码'}<input required minLength={8} maxLength={128} type="password" autoComplete={isRegister || isForgot ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" /></label>
        )}
        {isForgot && (
          <label>确认新密码<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" /></label>
        )}

        {!isRegister && !isForgot && loginMethod === 'password' && (
          <div className="auth-forgot"><Link to="/forgot-password">忘记密码？</Link></div>
        )}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="auth-success" role="status"><CheckCircle2 />{success}</div>}

        {isForgot && resetComplete ? (
          <button className="auth-submit" type="button" onClick={() => navigate('/login')}>返回登录</button>
        ) : (
          <button className="auth-submit" disabled={submitting}>{submitting ? '处理中…' : isRegister ? '验证并创建账号' : isForgot ? '确认重置密码' : '登录'}</button>
        )}

        <div className="auth-switch">
          {isForgot ? (
            <Link to="/login">← 返回登录</Link>
          ) : (
            <>{isRegister ? '已经有账号？' : '还没有账号？'}{' '}<Link to={isRegister ? '/login' : '/register'}>{isRegister ? '直接登录' : '免费注册'}</Link></>
          )}
        </div>
      </form>
    </div>
  )
}