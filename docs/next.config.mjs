import nextra from 'nextra'

const withNextra = nextra({
  defaultShowCopyCode: true,
  staticImage: true,
  theme: 'nextra-theme-docs'
})

// Add Cloudflare Pages specific configuration
export default withNextra({
  output: 'export',
  images: {
    unoptimized: true
  }
})
