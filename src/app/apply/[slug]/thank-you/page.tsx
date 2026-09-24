import { getRecruitingExperienceVersion } from "@/lib/recruiting";
import ThankYouV1 from "./ThankYouV1";
import ThankYouV2 from "./ThankYouV2";

export default async function ThankYouPage() {
  const version = await getRecruitingExperienceVersion();
  return version === "v2" ? <ThankYouV2 /> : <ThankYouV1 />;
}
