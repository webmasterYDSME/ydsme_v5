import Link from "next/link";
import { Fragment } from "react";
import { chapterHref, inlineTokens } from "@/lib/handbook/text";
import type { HandbookBlock, HandbookSection } from "@/lib/handbook/types";
import styles from "../handbook.module.css";

/** Handbook text with **bold**, `code` and [links](/admin/...). Never treated as HTML. */
export function Inline({ text }: { text: string }) {
  return <>{inlineTokens(text).map((token, index) => {
    if (token.kind === "bold") return <strong key={index}>{token.text}</strong>;
    if (token.kind === "code") return <code key={index}>{token.text}</code>;
    if (token.kind === "link" && token.href) return <Link key={index} href={token.href} prefetch={false}>{token.text}</Link>;
    return <Fragment key={index}>{token.text}</Fragment>;
  })}</>;
}

const noteClass = { info: styles.noteInfo, tip: styles.noteTip, warning: styles.noteWarning } as const;
const noteLabel = { info: "Good to know", tip: "Tip", warning: "Take care" } as const;

function Block({ block }: { block: HandbookBlock }) {
  switch (block.type) {
    case "p": return <p><Inline text={block.text}/></p>;
    case "steps": return <ol>{block.items.map((item, index) => <li key={index}><Inline text={item}/></li>)}</ol>;
    case "list": return <ul>{block.items.map((item, index) => <li key={index}><Inline text={item}/></li>)}</ul>;
    case "note": return <aside className={`${styles.note} ${noteClass[block.tone]}`} aria-label={block.title ?? noteLabel[block.tone]}>
      <strong className={styles.noteTitle}>{block.title ?? noteLabel[block.tone]}</strong>
      <p><Inline text={block.text}/></p>
    </aside>;
    case "table": return <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr>{block.head.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} data-label={block.head[index]}><Inline text={cell}/></td>)}</tr>)}</tbody>
    </table></div>;
  }
}

export function HandbookSections({ chapterSlug, sections }: { chapterSlug: string; sections: HandbookSection[] }) {
  return <>{sections.map((section) => <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
    <h3 id={`${section.id}-title`}><Link href={chapterHref(chapterSlug, section.id)} prefetch={false}>{section.title}</Link></h3>
    <div className={styles.prose}>{section.blocks.map((block, index) => <Block key={index} block={block}/>)}</div>
  </section>)}</>;
}

