import styles from "../account.module.css";

/** The result of the last change made in one section, shown inside that section so it is not scrolled out of sight. */
export type SectionMessage = { tone: "success" | "error"; text: string };

export function SectionNotice({ message }: { message: SectionMessage | null }) {
  if (!message) return null;
  return <p className={`form-message ${message.tone === "error" ? "error" : "success"} ${styles.message}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>;
}
