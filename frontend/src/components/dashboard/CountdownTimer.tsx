import type { Countdown } from '../../types'

function DigitBox({ value }: { value: string }) {
  return (
    <div className="bg-bg-elevated border border-border rounded-lg px-3 py-2 sm:px-4 sm:py-3 font-mono text-2xl sm:text-[32px] font-semibold leading-none">
      {value}
    </div>
  )
}

function DigitGroup({ value, label }: { value: number; label: string }) {
  const str = String(value).padStart(2, '0')
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-1">
        <DigitBox value={str[0]} />
        <DigitBox value={str[1]} />
      </div>
      <span className="text-[10px] text-text-tertiary tracking-[2px]">{label}</span>
    </div>
  )
}

function Separator() {
  return <span className="text-2xl text-text-tertiary self-start mt-2 sm:mt-3">:</span>
}

export function CountdownTimer({ countdown }: { countdown: Countdown }) {
  return (
    <div className="flex items-start gap-2">
      <DigitGroup value={countdown.days} label="DAYS" />
      <Separator />
      <DigitGroup value={countdown.hours} label="HRS" />
      <Separator />
      <DigitGroup value={countdown.minutes} label="MIN" />
      <Separator />
      <DigitGroup value={countdown.seconds} label="SEC" />
    </div>
  )
}
