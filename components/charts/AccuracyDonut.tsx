"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

export function AccuracyDonut({ data, accuracy }: { data: { correct: number, wrong: number, unattempted: number }, accuracy: string }) {
  const chartData = [
    { name: "Correct", value: data.correct, color: "var(--accent-success)" },
    { name: "Wrong", value: data.wrong, color: "var(--accent-error)" },
    { name: "Unattempted", value: data.unattempted, color: "var(--text-secondary)" }
  ]

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={110}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any, name: any) => [`${value} questions`, name]}
            contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }}
          />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
        <span className="text-3xl font-bold">{accuracy}%</span>
        <span className="text-sm text-muted-foreground">Accuracy</span>
      </div>
    </div>
  )
}
