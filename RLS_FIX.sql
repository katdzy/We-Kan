-- Run this in your Supabase SQL Editor to allow the board owner to remove members:

-- 1. Create a helper function to easily check if someone is an owner
CREATE OR REPLACE FUNCTION is_board_owner(target_board_id text, current_user_uuid uuid)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM board_members 
    WHERE board_id = target_board_id 
    AND user_id = current_user_uuid 
    AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Drop any potentially broken DELETE policies
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."board_members";
DROP POLICY IF EXISTS "Owners can remove members" ON "public"."board_members";

-- 3. Create a new safe DELETE policy
-- This allows you to delete your OWN row (leave a board) 
-- OR delete ANY row if you are the owner of that specific board.
CREATE POLICY "Owners can remove members and users can leave"
ON "public"."board_members"
FOR DELETE
USING (
  user_id = auth.uid() OR is_board_owner(board_id, auth.uid())
);
