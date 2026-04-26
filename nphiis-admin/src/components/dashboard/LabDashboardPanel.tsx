"use client";

import { useEffect, useState } from "react";
import {
  BeakerIcon,
  ClockIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/lib/auth-context";
import { fhirFetch } from "@/lib/api";
import { LAB_FORMS } from "@/lib/questionnaires";
import StatCard from "./StatCard";
import { StatCardSkeleton, TableSkeleton } from "../ui/Skeleton";

interface QrEntry {
  resource?: {
    id?: string;
    authored?: string;
    questionnaire?: string;
    subject?: { reference?: string };
  };
}
interface QrBundle {
  total?: number;
  entry?: QrEntry[];
}

interface RecentRow {
  id: string;
  authored: string;
  formTitle: string;
  patientRef: string;
}

function titleFor(url: string | undefined): string {
  if (!url) return "Unknown form";
  const match = LAB_FORMS.find((f) => f.questionnaireUrl === url);
  return match?.title ?? url.split("/").pop() ?? "Unknown form";
}

function sevenDaysAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export default function LabDashboardPanel() {
  const { roles, user } = useAuth();
  const isNationalLab = roles.includes("NATIONAL_LAB");
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [last7, setLast7] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const urlList = LAB_FORMS.map((f) => f.questionnaireUrl).join(",");
        const recentRes = await fhirFetch(
          `/api/fhir/QuestionnaireResponse?questionnaire=${encodeURIComponent(urlList)}&_sort=-_lastUpdated&_count=10`,
        );
        if (!recentRes.ok) throw new Error(`HAPI ${recentRes.status}`);
        const recentBundle = (await recentRes.json()) as QrBundle;

        const countRes = await fhirFetch(
          `/api/fhir/QuestionnaireResponse?questionnaire=${encodeURIComponent(urlList)}&authored=ge${sevenDaysAgoISO()}&_summary=count`,
        );
        const countBundle = countRes.ok
          ? ((await countRes.json()) as QrBundle)
          : { total: 0 };

        if (cancelled) return;

        setRecent(
          (recentBundle.entry ?? [])
            .filter((e) => e.resource?.id)
            .map((e) => ({
              id: e.resource!.id!,
              authored: e.resource!.authored ?? "",
              formTitle: titleFor(e.resource!.questionnaire),
              patientRef: e.resource!.subject?.reference ?? "",
            })),
        );
        setLast7(countBundle.total ?? 0);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const configured = LAB_FORMS.filter((f) =>
    f.allowedRoles.some((r) => roles.includes(r)),
  ).length;

  return (
    <div className="space-y-6">
      <div className="card-lg p-6 bg-nphi-gradient text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <h2 className="text-2xl font-semibold relative">
          Lab dashboard{isNationalLab ? " - National" : ""}
        </h2>
        <p className="text-sm text-nphi-100 mt-1 relative">
          Welcome{user?.name ? `, ${user.name}` : ""}. Track recent lab
          submissions and jump to uploads.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Submissions (7d)"
              value={last7 ?? 0}
              icon={DocumentCheckIcon}
              tone="green"
            />
            <StatCard
              label="Configured forms"
              value={configured}
              hint="Forms you can submit"
              icon={BeakerIcon}
              tone="neutral"
            />
            <StatCard
              label="Recent authored"
              value={recent.length}
              hint="Last 10 across your forms"
              icon={ClockIcon}
              tone="red"
            />
          </>
        )}
      </div>

      {error && (
        <div className="chip bg-accent-50 text-accent-700">{error}</div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={3} />
      ) : (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-nphi-100/60">
            <h3 className="text-base font-semibold text-nphi-900">
              Recent submissions
            </h3>
            <p className="text-xs text-gray-500">
              From the configured lab Questionnaires
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-nphi-50/60">
                <tr className="text-left text-[11px] text-nphi-800 uppercase tracking-wider">
                  <th className="px-6 py-3 font-semibold">Form</th>
                  <th className="px-6 py-3 font-semibold">Patient</th>
                  <th className="px-6 py-3 font-semibold">Authored</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-6 text-center text-gray-500"
                    >
                      No lab responses yet. Use the Lab tab to upload a CSV.
                    </td>
                  </tr>
                ) : (
                  recent.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-nphi-100/40 hover:bg-nphi-50/40"
                    >
                      <td className="px-6 py-3 text-nphi-900 font-medium">
                        {r.formTitle}
                      </td>
                      <td className="px-6 py-3 text-gray-700">
                        {r.patientRef || "-"}
                      </td>
                      <td className="px-6 py-3 text-gray-700">
                        {r.authored
                          ? new Date(r.authored).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
