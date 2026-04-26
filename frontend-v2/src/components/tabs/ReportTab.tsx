import { useState } from 'react'

interface ReportTabProps {
  morningReport?: string | null
  morningReportAt?: string | null
  eveningReport?: string | null
  eveningReportAt?: string | null
  initialSlot?: 'morning' | 'evening'
}

export const ReportTab = ({
  morningReport, morningReportAt,
  eveningReport, eveningReportAt,
  initialSlot = 'morning',
}: ReportTabProps) => {
  const [slot, setSlot] = useState<'morning' | 'evening'>(initialSlot)
  const [copied, setCopied] = useState(false)

  const report = slot === 'morning' ? morningReport : eveningReport
  const reportAt = slot === 'morning' ? morningReportAt : eveningReportAt

  const handleCopy = async () => {
    if (!report) return
    await navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="rounded-[28px] border border-[#9fb4d1]/10 bg-[linear-gradient(180deg,rgba(9,16,27,0.98),rgba(7,12,21,0.96))] px-4 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8da4c3]">Report workspace</p>
        <p className="mt-2 text-lg font-semibold text-white">保存済みレポートを確認して、AI に渡すテキストを整えます。</p>
      </div>

      <div className="flex gap-2">
        {(['morning', 'evening'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={[
              'flex-1 rounded-full border py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
              slot === s
                ? 'bg-[#7dd3fc]/12 border-[#7dd3fc]/30 text-[#aee5ff]'
                : 'border-white/10 text-white/35 hover:text-white',
            ].join(' ')}
          >
            {s === 'morning' ? 'Morning report' : 'Evening report'}
          </button>
        ))}
      </div>

      <div className="min-h-[200px] rounded-[24px] border border-white/[0.08] bg-[#0b1320] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
            AI report text
          </p>
          {reportAt && (
            <span className="text-[10px] text-white/24">Generated {reportAt}</span>
          )}
        </div>
        {report ? (
          <>
            <pre className="text-sm text-[#ccc] whitespace-pre-wrap leading-relaxed font-sans">
              {report}
            </pre>
            <p className="mt-3 text-[10px] text-white/24">
              内容を更新したい場合は {slot === 'morning' ? 'Morning' : 'Evening'} タブで再生成します。
            </p>
          </>
        ) : (
          <p className="text-sm italic text-white/28">
            {slot === 'morning' ? 'Morning' : 'Evening'} タブで report を生成するとここに保存されます。
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleCopy}
        disabled={!report}
        className={[
          'w-full rounded-full py-3 text-sm font-semibold uppercase tracking-[0.16em] transition-colors',
          report
            ? 'bg-[#7dd3fc] text-black hover:bg-[#67c7f5]'
            : 'bg-[#1c1c1c] text-[#444] cursor-not-allowed',
        ].join(' ')}
      >
        {copied ? 'Copied' : 'Copy report'}
      </button>

      <div className="space-y-2 rounded-[24px] border border-white/[0.06] bg-[#111827]/75 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">Workflow</p>
        {[
          { time: '朝（5〜7時）',   desc: 'チェック → 日報生成 → Claudeへ貼り付け' },
          { time: '夜（18時〜）',   desc: 'チェック → 夜の日報生成 → Claudeへ貼り付け' },
          { time: '金曜',           desc: '「今週の振り返りをして」とClaudeに送るだけ' },
          { time: 'ラスボス',       desc: '前夜に明日の1タスクを設定 → 朝に自動表示' },
        ].map(({ time, desc }) => (
          <div key={time} className="flex gap-3 text-xs">
            <span className="w-24 flex-shrink-0 font-medium text-[#8ed8ff]">{time}</span>
            <span className="text-white/36">{desc}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-[#38bdf8]/20 bg-[#38bdf8]/5 p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8ed8ff]">In-app AI handoff</p>
        <p className="text-xs text-white/36">
          日報テキストをベースに、アプリ内からClaudeへ送信・返答を受け取る機能を準備中です。
        </p>
      </div>
    </div>
  )
}
