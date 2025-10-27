interface Photo {
  filename: string
  path: string
}

interface PhotoGalleryProps {
  photos: Photo[]
  albumName?: string
}

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  return (
    <div className="w-full max-w-4xl mx-auto pb-8" style={{ position: 'relative', zIndex: 1 }}>
      {/* Photo Stack - Terminal Style */}
      <div className="flex flex-col gap-4">
        {photos.map((photo) => (
          <div
            key={photo.filename}
            className="w-full flex items-center justify-center"
            style={{ position: 'relative', zIndex: 1 }}
          >
            <img
              src={photo.path}
              alt={photo.filename}
              className="w-auto h-auto max-w-full object-contain"
              style={{ maxHeight: 'calc(100vh - 200px)', position: 'relative', zIndex: 1 }}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
