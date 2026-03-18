
-- Hobby catalog categories table
CREATE TABLE public.hobby_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '📁',
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hobby subcategories
CREATE TABLE public.hobby_subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.hobby_categories(id) ON DELETE CASCADE NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Profile fields (activity profile)
    location_types TEXT[] DEFAULT '{"indoor","outdoor"}',
    physical_intensity TEXT DEFAULT 'medium',
    group_size_min INT DEFAULT 2,
    group_size_max INT DEFAULT 20,
    group_size_typical INT DEFAULT 8,
    has_distance BOOLEAN DEFAULT false,
    has_duration BOOLEAN DEFAULT true,
    has_skill_level BOOLEAN DEFAULT true,
    has_equipment BOOLEAN DEFAULT false,
    is_competitive BOOLEAN DEFAULT false,
    is_team_based BOOLEAN DEFAULT false,
    can_be_online BOOLEAN DEFAULT false,
    suggested_duration_min INT DEFAULT 90,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hobby activities (leaf level)
CREATE TABLE public.hobby_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subcategory_id UUID REFERENCES public.hobby_subcategories(id) ON DELETE CASCADE NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT,
    keywords TEXT[] DEFAULT '{}',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Override profile fields (nullable = inherit from subcategory)
    physical_intensity TEXT,
    group_size_min INT,
    group_size_max INT,
    is_team_based BOOLEAN,
    can_be_online BOOLEAN,
    age_restriction TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.hobby_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hobby_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hobby_activities ENABLE ROW LEVEL SECURITY;

-- Everyone can read catalog
CREATE POLICY "Catalog readable by all" ON public.hobby_categories FOR SELECT USING (true);
CREATE POLICY "Catalog readable by all" ON public.hobby_subcategories FOR SELECT USING (true);
CREATE POLICY "Catalog readable by all" ON public.hobby_activities FOR SELECT USING (true);

-- Only admins can write
CREATE POLICY "Admins manage categories" ON public.hobby_categories FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage subcategories" ON public.hobby_subcategories FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage activities" ON public.hobby_activities FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update triggers
CREATE TRIGGER update_hobby_categories_updated_at BEFORE UPDATE ON public.hobby_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hobby_subcategories_updated_at BEFORE UPDATE ON public.hobby_subcategories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hobby_activities_updated_at BEFORE UPDATE ON public.hobby_activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
