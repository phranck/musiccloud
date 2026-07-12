/**
 * Semantic heading-and-body region for a distinct part of an API operation.
 *
 * Authentication, parameters, request bodies, and responses share this
 * structure while retaining their own domain-specific content in children.
 */

import type { Icon } from "iconsax-react";
import type { PropsWithChildren } from "react";
import { joinClassNames } from "@/components/docs/classNames";

interface Props extends PropsWithChildren {
  headingId?: string;
  icon: Icon;
  title: string;
  variant?: "authentication";
}

export function EndpointDetail({ children, headingId, icon: Icon, title, variant }: Props) {
  return (
    <section
      className={joinClassNames("endpoint-detail", variant && `endpoint-detail--${variant}`)}
      aria-label={headingId ? undefined : title}
      aria-labelledby={headingId}
    >
      <h4 id={headingId} className="endpoint-detail__heading">
        <Icon className="size-5" aria-hidden="true" />
        <span>{title}</span>
      </h4>
      {children}
    </section>
  );
}
