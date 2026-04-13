// Sizes: sm, md, lg
const SIZE_MAP = {
  sm: 'w-3.5 h-3.5 border-[1.5px]',
  md: 'w-5 h-5 border-2',
  lg: 'w-8 h-8 border-2',
}

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md
  return (
    <span
      className={`inline-block rounded-full animate-spin ${sizeClass} ${className}`}
      style={
        !className.includes('border-')
          ? { borderColor: 'rgba(244,123,32,0.2)', borderTopColor: '#F47B20' }
          : undefined
      }
    />
  )
}
