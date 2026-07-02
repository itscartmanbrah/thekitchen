'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface DataPoint { date: string; elo: number; label: string }

interface Props {
  data: DataPoint[]
  startElo?: number
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as DataPoint
  return (
    <div className="bg-card border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{d.elo} ELO</p>
      <p className="text-muted-foreground">{d.label}</p>
    </div>
  )
}

export function EloHistoryChart({ data, startElo = 1000 }: Props) {
  if (data.length < 2) return (
    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground/80">
      Need at least 2 matches to show a chart
    </div>
  )

  const elos = data.map(d => d.elo)
  const min = (Math.min(...elos) || 1000) - 30
  const max = (Math.max(...elos) || 1000) + 30

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
        <YAxis domain={[min, max]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={startElo} stroke="#e5e7eb" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="elo"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
