import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home, FilePlus, FolderOpen, Calculator, DollarSign, Truck,
  FileText, Settings, History, CheckSquare, Menu, X, HardHat
} from 'lucide-react'

const navItems = [
  { path: '/', label: 'الرئيسية', icon: Home },
  { path: '/new-request', label: 'طلب جديد', icon: FilePlus },
  { path: '/projects', label: 'المشاريع', icon: FolderOpen },
  { path: '/prices', label: 'الأسعار', icon: DollarSign },
  { path: '/suppliers', label: 'الموردون', icon: Truck },
  { path: '/logs', label: 'سجل العمليات', icon: History },
  { path: '/settings', label: 'الإعدادات', icon: Settings },
]

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 right-0 z-50 h-screen w-64 bg-white border-l border-gray-200
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardHat className="w-8 h-8 text-primary-600" />
              <span className="text-lg font-bold text-gray-900">المقاول الإلكتروني</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                  ${isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
            <HardHat className="w-4 h-4" />
            <span>الإصدار 1.0.0</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between px-4 h-14">
            <button onClick={() => setSidebarOpen(true)} className="p-1">
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <HardHat className="w-6 h-6 text-primary-600" />
              <span className="font-bold text-gray-900">المقاول الإلكتروني</span>
            </div>
            <div className="w-8" />
          </div>
        </header>

        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
