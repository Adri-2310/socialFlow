-- D57 : suivi de l'abonnement par webhook Stripe.
-- Debut du delai de grace (paiement echoue) et date du dernier evenement
-- Stripe applique, pour ignorer un evenement arrive dans le desordre.
ALTER TABLE "cabinet" ADD COLUMN "pastDueSince" TIMESTAMP(3);
ALTER TABLE "cabinet" ADD COLUMN "billingEventAt" TIMESTAMP(3);

-- Idempotence : un evenement Stripe n'est traite qu'une fois, meme rejoue.
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_event_eventId_key" ON "webhook_event"("eventId");
