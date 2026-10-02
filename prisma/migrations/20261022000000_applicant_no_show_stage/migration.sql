-- No-Show pipeline stage: an applicant who didn't show up for a scheduled
-- Phone/Zoom or In-Person interview. Purely additive — every existing
-- ApplicantStage value is untouched.
ALTER TYPE "ApplicantStage" ADD VALUE 'NO_SHOW';
