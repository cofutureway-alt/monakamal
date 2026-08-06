-- Add order_index column to stages for drag and drop ordering
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0;
