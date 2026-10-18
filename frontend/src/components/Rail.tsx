import { BookOpenText, Moon, Search, Star, Sun } from 'lucide-react'

interface Props { dark: boolean; onSearch: () => void; onToggleTheme: () => void }

export function Rail({ dark, onSearch, onToggleTheme }: Props) {
  return (
    <nav className="rail" aria-label="主导航">
      <button className="logo" title="墨帆首页">墨</button>
      <div className="rail-main">
        <button className="rail-btn active" title="文档"><BookOpenText /></button>
        <button className="rail-btn" title="搜索" onClick={onSearch}><Search /></button>
        <button className="rail-btn" title="收藏"><Star /></button>
      </div>
      <div className="rail-bottom">
        <button className="rail-btn" title="切换主题" onClick={onToggleTheme}>{dark ? <Sun /> : <Moon />}</button>
        <button className="avatar" title="个人账号">ME<i /></button>
      </div>
    </nav>
  )
}
