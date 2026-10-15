import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { CalendarSetupForm } from "@/components/calendar-setup-form";
import { PageHeading } from "@/components/entry-card";
import { getCurrentUser } from "@/lib/auth";
import { getCalendar } from "@/lib/calendar-store";

export const metadata: Metadata = { title: "Calendar setup" };

export default async function CalendarSetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "dm") redirect("/calendar");
  const cal = await getCalendar();

  return (
    <div className="max-w-3xl">
      <PageHeading Icon={Settings2} title="Calendar setup" blurb="Name your months and weekdays and say what day it is now. Changing them changes how every date is shown." />
      <CalendarSetupForm initial={cal} />
    </div>
  );
}
