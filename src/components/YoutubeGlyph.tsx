import type { SVGProps } from 'react'

export default function YoutubeGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <rect x="2.25" y="5.25" width="19.5" height="13.5" rx="4" fill="currentColor" />
      <path d="M10 9.25v5.5l4.75-2.75L10 9.25Z" fill="#07090d" />
    </svg>
  )
}
