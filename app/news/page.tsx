import { format } from "date-fns";
import { Megaphone } from "lucide-react";
import { Reveal } from "@/app/components/RailSite";
import { PageShell } from "@/app/components/PageShell";
import { getNewsAnnouncements } from "@/lib/data";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata({
  title: "News & Public Announcements",
  description: "Read the latest public announcements and Society updates from York Model Engineers.",
  path: "/news",
  keywords: ["York Model Engineers news", "miniature railway announcements"],
});

export default async function News() {
  const announcements = await getNewsAnnouncements(5);

  return <PageShell headerTheme="light">
    <section className="section news-board" aria-labelledby="news-heading">
      <header className="news-heading">
        <div><p className="eyebrow dark">The Society noticeboard</p><h1 id="news-heading">News from the line.</h1></div>
        <p>Public notices and the latest updates for visitors, members and friends of the railway, with the newest announcement first.</p>
      </header>
      {announcements.length ? <div className="news-list">
        {announcements.map((announcement, index) => <Reveal key={announcement.id} delay={index * 0.05}>
          <article className="news-card">
            <div className="news-card-date"><Megaphone aria-hidden="true"/><time dateTime={announcement.published_at}>{format(new Date(announcement.published_at), "d MMM yyyy")}</time></div>
            <div><h3>{announcement.title}</h3><p>{announcement.body}</p></div>
          </article>
        </Reveal>)}
      </div> : <div className="empty-state news-empty"><Megaphone aria-hidden="true"/><h3>No announcements right now.</h3><p>When there is news from the Society, it will appear here and aboard the homepage train.</p></div>}
    </section>
  </PageShell>;
}
