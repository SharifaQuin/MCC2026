-- Recruiting 2.0: a new pipeline stage for "Shar tapped Invite to Interview,
-- booking link sent, candidate hasn't picked a slot yet." Purely additive —
-- every existing ApplicantStage value is untouched.
ALTER TYPE "ApplicantStage" ADD VALUE 'INTERVIEW_INVITE_SENT';
