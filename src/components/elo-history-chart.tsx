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
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800">{d.elo} ELO</p>
      <p className="text-gray-500">{d.label}</p>
    </div>
  )
}

export function EloHistoryChart({ data, startElo = 1000 }: Props) {
  if (data.length < 2) return (
    <div className="flex items-center justify-center h-24 text-xs text-gray-400">
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
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 3, fill: '#16a34a', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
