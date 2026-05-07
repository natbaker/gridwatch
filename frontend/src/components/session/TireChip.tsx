export function TireChip({ compound, color, age }: { compound: string; color: string; age: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center border border-white/20"
        style={{ backgroundColor: color, color: compound === 'HARD' ? '#333' : '#fff' }}
      >
        {compound.charAt(0) || '?'}
      </span>
      <span className="text-[10px] text-text-tertiary font-mono">{age}L</span>
    </div>
  )
}
