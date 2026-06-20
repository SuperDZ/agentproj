"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { buttonStyles } from "@/components/ui";

function DeleteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={buttonStyles.danger}>
      <Trash2 className="h-4 w-4" />
      {pending ? "删除中..." : "删除"}
    </button>
  );
}

export function ProjectDeleteButton({ action, projectName }: { action: () => Promise<void>; projectName: string }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`确认删除项目「${projectName}」？该操作会删除关联调研、竞品、报告和产物。`)) {
          event.preventDefault();
        }
      }}
    >
      <DeleteSubmitButton />
    </form>
  );
}
