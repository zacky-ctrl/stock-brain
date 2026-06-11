'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const prevPathname = useRef(pathname)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimers() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }

  function startProgress() {
    clearTimers()
    setVisible(true)
    setWidth(18)
    let w = 18
    intervalRef.current = setInterval(() => {
      w = Math.min(82, w + Math.random() * 10 + 4)
      setWidth(w)
    }, 400)
  }

  function finishProgress() {
    clearTimers()
    setWidth(100)
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      setWidth(0)
    }, 250)
  }

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      finishProgress()
    }
  }, [pathname])

  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('http') ||
        href.startsWith('mailto') ||
        href.startsWith('tel') ||
        anchor.target === '_blank'
      ) return

      const targetPath = href.split('?')[0]
      const currentPath = window.location.pathname
      if (targetPath === currentPath) return

      startProgress()
    }

    document.addEventListener('click', onLinkClick)
    return () => {
      document.removeEventListener('click', onLinkClick)
      clearTimers()
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 10000,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))',
          boxShadow: '0 0 8px var(--accent)',
          borderRadius: '0 2px 2px 0',
          transition: width === 100 ? 'width 0.15s ease-out' : 'width 0.4s ease',
        }}
      />
    </div>
  )
}
