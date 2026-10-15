import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const { data, error } = await supabase
      .from("patients")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          connected: false,
          error: "Supabase connectivity check failed.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      connected: true,
      message: "SmartCare is connected to Supabase.",
      has_records: Boolean(data && data.length > 0),
    });
  } catch (error) {
    console.error("Supabase connectivity check failed.", error);
    return NextResponse.json(
      {
        connected: false,
        error: "Supabase connectivity check failed.",
      },
      { status: 500 }
    );
  }
}