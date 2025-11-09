import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { parseCsvFiles } from "@/lib/csv";
import { useCoursesStore } from "@/store/courses";
import { FileUp } from "lucide-react";

export const UploadCsvButton = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loadRows = useCoursesStore((state) => state.loadRows);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    try {
      const rows = await parseCsvFiles(fileArray);
      loadRows(rows);
    } catch (error) {
      console.error("Failed to parse CSV", error);
      alert("Unable to parse CSV file. Please verify the format.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={(event) => handleUpload(event.target.files)}
      />
      <Button
        variant="primary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="gap-2"
      >
        <FileUp className="h-4 w-4" />
        Upload CSV
      </Button>
    </>
  );
};

