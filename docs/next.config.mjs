import nextra from 'nextra'
 
const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.jsx'
})
 
// Add Cloudflare Pages specific configuration
export default withNextra({
  output: 'export',
  images: {
    unoptimized: true
  }
})
