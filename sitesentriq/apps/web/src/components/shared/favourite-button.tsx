import { Star } from 'lucide-react'
import { useIsFavourite, useToggleFavourite } from '@/hooks/use-favourites'

interface FavouriteButtonProps {
  entityType: 'client' | 'property' | 'asset' | 'job'
  entityId: string
}

export function FavouriteButton({ entityType, entityId }: FavouriteButtonProps) {
  const { isFavourite, favouriteId } = useIsFavourite(entityType, entityId)
  const toggleFavourite = useToggleFavourite()

  const handleClick = () => {
    toggleFavourite.mutate({ entityType, entityId, favouriteId })
  }

  return (
    <button
      onClick={handleClick}
      disabled={toggleFavourite.isPending}
      className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-surface-elevated disabled:opacity-50"
      title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
    >
      <Star
        className={`h-4 w-4 ${
          isFavourite
            ? 'fill-status-due-soon text-status-due-soon'
            : 'fill-none text-text-muted'
        }`}
      />
    </button>
  )
}
