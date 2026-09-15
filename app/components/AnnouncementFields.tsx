"use client";

import { useId, useState } from "react";
import {
  ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from "@/lib/announcements";

export function AnnouncementFields({
  initialTitle = "",
  initialDescription = "",
}: {
  initialTitle?: string;
  initialDescription?: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const titleHelpId = useId();
  const descriptionHelpId = useId();

  return <>
    <label className="wide">
      Title
      <input
        name="title"
        aria-label="Title"
        placeholder="Give your update a clear, short title"
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
        minLength={2}
        maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
        aria-describedby={titleHelpId}
        required
      />
      <span className="announcement-field-meta" id={titleHelpId}>
        <small>Maximum {ANNOUNCEMENT_TITLE_MAX_LENGTH} characters.</small>
        <output aria-live="polite" data-over-limit={title.length > ANNOUNCEMENT_TITLE_MAX_LENGTH}>
          {title.length} / {ANNOUNCEMENT_TITLE_MAX_LENGTH}
        </output>
      </span>
    </label>
    <label className="wide">
      Description
      <textarea
        name="body"
        aria-label="Description"
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
        rows={5}
        placeholder="Explain what’s happening, who it affects and anything readers need to do."
        minLength={2}
        maxLength={ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH}
        aria-describedby={descriptionHelpId}
        required
      />
      <span className="announcement-field-meta" id={descriptionHelpId}>
        <small>Keep it concise. Maximum {ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH} characters.</small>
        <output aria-live="polite" data-over-limit={description.length > ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH}>
          {description.length} / {ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH}
        </output>
      </span>
    </label>
  </>;
}
