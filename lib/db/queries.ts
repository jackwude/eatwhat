import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type HistoryCreateInput = {
  inputText: string;
  ownedIngredients: string[];
  dishName?: string;
  recommendations?: Prisma.InputJsonValue;
  recipeDetail?: Prisma.InputJsonValue;
};

export async function createHistoryEntry(input: HistoryCreateInput) {
  return prisma.historyEntry.create({
    data: {
      inputText: input.inputText,
      ownedIngredients: input.ownedIngredients,
      dishName: input.dishName,
      recommendations: input.recommendations,
      recipeDetail: input.recipeDetail,
    },
  });
}

export async function listHistoryEntries(limit = 20) {
  return prisma.historyEntry.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}
