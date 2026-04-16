import logoUrl from './logo.png'

interface LogoIconProps {
  className?: string
}

export default function LogoIcon({ className = 'w-10 h-10' }: LogoIconProps) {
  return (
    <img
      src={logoUrl}
      alt="Nexla Operacional"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
