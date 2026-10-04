-- O Prisma não modela CHECK constraints no schema, então esta migration é SQL manual.
-- Garante no banco que a nota fica entre 1 e 5, mesmo se alguém escrever direto na tabela.
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5);
