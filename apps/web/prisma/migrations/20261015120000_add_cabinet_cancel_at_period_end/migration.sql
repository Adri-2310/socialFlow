-- D59 : resiliation programmee en fin de periode, suivie depuis Stripe.
ALTER TABLE "cabinet" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
