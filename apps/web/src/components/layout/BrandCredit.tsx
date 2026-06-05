type BrandCreditProps = {
  className?: string
}

export function BrandCredit({ className }: BrandCreditProps) {
  const year = new Date().getFullYear()

  return (
    <footer className={className ? `brand-credit ${className}` : 'brand-credit'}>
      <span>© {year} Nirankari Bindi</span>
      <span aria-hidden="true">·</span>
      <span>A project by GrowthARCH</span>
    </footer>
  )
}
