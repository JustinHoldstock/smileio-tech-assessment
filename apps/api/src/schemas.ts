import { SmilePointsProductSchema } from "@repo/shared";
import { z } from "zod";

/** Shape returned by Smile.io /points_products */
export const SmilePointsProductsSchema = z.object({
  points_products: SmilePointsProductSchema.array()
});

export type SmilePointsProducts = z.infer<typeof SmilePointsProductsSchema>;
