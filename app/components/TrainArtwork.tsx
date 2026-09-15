/** Crisp, hand-drawn railway details that remain sharp at every screen size. */
function RailwayWheel({ x, y, radius = 14 }: { x: number; y: number; radius?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <g className="railway-wheel">
      <circle r={radius} fill="#17231f" stroke="#aeb7aa" strokeWidth="2" />
      <circle r={radius - 4} fill="#913e32" stroke="#d69b69" strokeWidth="1" />
      <path d={`M0 -${radius - 4}V${radius - 4}M-${radius - 4} 0H${radius - 4}M-${(radius - 4) * .7} -${(radius - 4) * .7}L${(radius - 4) * .7} ${(radius - 4) * .7}M-${(radius - 4) * .7} ${(radius - 4) * .7}L${(radius - 4) * .7} -${(radius - 4) * .7}`} stroke="#d69b69" strokeWidth="1.5" />
      <circle r="3" fill="#f1d095" />
    </g>
  </g>;
}

export function WagonWheelArtwork() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <RailwayWheel x={12} y={12} radius={11}/>
  </svg>;
}

export function LocomotiveArtwork() {
  return <svg className="locomotive-art" viewBox="0 0 200 112" fill="none" aria-hidden="true">
    <path d="M10 82H186V90H10z" fill="#a44738" stroke="#edb581" />
    <path d="M19 78V26H65V79" fill="#204f3e" stroke="#c6a05d" strokeWidth="2" />
    <path d="M14 26Q39 17 70 25L72 30H13z" fill="#152d25" stroke="#d3b374" strokeWidth="2" />
    <path d="M26 34H42V54H26zM48 34H59V54H48z" fill="#a9c7b6" stroke="#e7c484" strokeWidth="2" />
    <path d="M28 36L39 36L28 49M50 36H57L50 46" fill="#e4e6c9" opacity=".6" />
    <rect x="26" y="61" width="32" height="13" rx="6" fill="#172c24" stroke="#c6a05d" />
    <text x="42" y="70" fill="#f1d095" textAnchor="middle" fontSize="8" fontFamily="Georgia, serif">1929</text>
    <path d="M65 46H155Q176 46 176 63Q176 79 155 79H65z" fill="#285d47" stroke="#c6a05d" strokeWidth="2" />
    <path d="M69 51H150" stroke="#73a286" strokeWidth="3" />
    <path d="M88 47V78M124 47V78" stroke="#d1ae6a" strokeWidth="4" />
    <path d="M91 47V78M127 47V78" stroke="#75592f" />
    <path d="M153 47H163Q177 47 177 63T163 79H153z" fill="#182d25" stroke="#c6a05d" strokeWidth="2" />
    <path d="M146 44L143 23H158L156 44M140 19H161V25H140z" fill="#24392f" stroke="#d8b371" strokeWidth="2" />
    <path d="M100 45V38Q100 28 110 28T120 38V45" fill="#d0a858" stroke="#f1d095" />
    <path d="M78 44V32M75 33H81" stroke="#e7c484" strokeWidth="3" />
    <path d="M68 61H145" stroke="#eed19a" strokeWidth="2" />
    <path d="M71 60V69M139 60V69" stroke="#eed19a" />
    <rect x="176" y="57" width="10" height="13" rx="3" fill="#f8dfa0" stroke="#bc995b" strokeWidth="2" />
    <path d="M184 80V91H195M9 86H2" stroke="#bec1aa" strokeWidth="4" />
    <RailwayWheel x={39} y={94} radius={16} />
    <RailwayWheel x={80} y={94} radius={16} />
    <RailwayWheel x={121} y={94} radius={16} />
    <RailwayWheel x={166} y={99} radius={11} />
    <path className="locomotive-rod" d="M39 97H121" stroke="#e3d7ba" strokeWidth="4" strokeLinecap="round" />
    <path d="M143 80H174V88H143z" fill="#994335" stroke="#d0a46d" />
  </svg>;
}

export function CoalTenderArtwork() {
  return <svg className="coal-tender" viewBox="0 0 100 112" fill="none" aria-hidden="true">
    <path d="M13 43L19 33L27 36L35 27L45 32L52 25L63 34L74 30L85 43" fill="#1a211f" stroke="#71776b" strokeWidth="2" />
    <path d="M24 38L35 35L42 40M49 34L55 31L63 39M69 39L77 36" stroke="#525e54" strokeWidth="2" />
    <path d="M10 42H90L86 83H14z" fill="#224d3a" stroke="#c8a15e" strokeWidth="2" />
    <path d="M19 49H81V74H19z" stroke="#b88c48" />
    <text x="50" y="64" textAnchor="middle" fill="#edd098" fontSize="8" letterSpacing="1.5" fontFamily="Georgia, serif">YDSME</text>
    <path d="M8 82H92V90H8z" fill="#9d4334" stroke="#c39b6b" />
    <path d="M0 86H8M92 86H100" stroke="#b9b5a0" strokeWidth="3" />
    <RailwayWheel x={27} y={94} radius={16} />
    <RailwayWheel x={74} y={94} radius={16} />
  </svg>;
}
