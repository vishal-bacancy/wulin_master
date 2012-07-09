require 'wulin_master/components/grid/sql_adapter'
module WulinMaster
  class Column
    attr_accessor :name, :options

    def initialize(name, grid_class, opts={})
      @name = name
      @grid_class = grid_class
      @options = {:width => 150, :sortable => true, :editable => true}.merge(opts)
    end

    def label
      @options[:label] || @name.to_s.underscore.humanize
    end

    def datetime_format
      @options[:datetime_format] || WulinMaster.default_datetime_format
    end
    
    def relation_table_name
      options[:join_aliased_as] || self.reflection.klass.table_name
    end

    def to_column_model
      field_name = @name.to_s
      sort_col_name = @options[:sort_column] || field_name
      table_name = self.reflection ? relation_table_name : self.model.table_name.to_s
      new_options = @options.dup
      h = {:id => @name, :name => self.label, :table => table_name, :field => field_name, :type => sql_type, :sortColumn => sort_col_name}.merge(new_options)
      h.merge!(reflection_options) if reflection
      h
    end

    # Format a value 
    # Called during json rendering
    def format(value)
      if value.class == Time || value.class == ActiveSupport::TimeWithZone
        value.to_formatted_s(datetime_format)
      elsif value.class.name == 'BSON::ObjectId'
        value.to_s
      else
        value
      end
    end

    # Dynamically add some new options to the column
    def add_options(new_options={})
      @options.merge!(new_options)
    end

    # Apply a where condition on the query to filter the result set with the filtering value
    def apply_filter(query, filtering_value, filtering_operator='equals')
      adapter = WulinMaster::SqlAdapter.new(model, query)
      filtering_operator ||= 'equals'
      return query if filtering_value.blank?
      
      # Search by NULL
      if filtering_value.to_s.downcase == 'null'
        operator = case filtering_operator
        when 'equals' then ''
        when 'not_equals' then 'NOT'
        end
        if self.reflection
          return query.where("#{relation_table_name}.#{self.option_text_attribute} IS #{operator} NULL")
        else
          adapter.null_query(complete_column_name, operator, self)
          return adapter.query
        end
      end
      
      if self.reflection
        if @options[:sql_expression]
          return query.where(["UPPER(#{@options[:sql_expression]}) LIKE UPPER(?)", filtering_value+"%"])
        elsif option_text_attribute =~ /(_)?id$/ or column_type(self.reflection.klass, self.option_text_attribute) == :integer
          if ['equals', 'not_equals'].include? filtering_operator
            operator = (filtering_operator == 'equals') ? '=' : '!='
            return query.where("#{relation_table_name}.#{self.option_text_attribute} #{operator} ?", filtering_value)
          elsif ['include', 'exclude'].include? filtering_operator
            ids = relation_table_name.classify.constantize.where("#{relation_table_name}.#{self.option_text_attribute} = ?", filtering_value).map do |e|
              e.send("#{model.table_name}").map(&:id)
            end.flatten.uniq
            if ids.blank?
              operator = (filtering_operator == 'include') ? 'IS' : 'IS NOT'
              return query.where("#{model.table_name}.id #{operator} NULL")
            else
              operator = (filtering_operator == 'include') ? 'IN' : 'NOT IN'
              return query.where("#{model.table_name}.id #{operator} (?)", ids)
            end
          end          
        else
          operator = case filtering_operator 
          when 'equals' then 'LIKE'
          when 'not_equals' then 'NOT LIKE'
          end
          return query.where(["UPPER(#{relation_table_name}.#{self.option_text_attribute}) #{operator} UPPER(?)", filtering_value + "%"])
        end
      # ----------- !!! TODO, has not consider the filter operator for following cases, need to add in future ----------
      else
        case sql_type.to_s
        when 'date', 'datetime'
          return query.where(["to_char(#{self.name}, 'YYYY-MM-DD') LIKE UPPER(?)", filtering_value+"%"])
        when "boolean"
          true_values = ["y", "yes", "ye", "t", "true"]
          true_or_false = true_values.include?(filtering_value.downcase)
          adapter.boolean_query(complete_column_name, true_or_false, self)
          return adapter.query
        else
          filtering_value = filtering_value.gsub(/'/, "''")
          if sql_type.to_s == 'integer' and is_table_column?
            return query.where(self.name => filtering_value)
          else
            adapter.string_query(complete_column_name, filtering_value, self)
            return adapter.query
          end
        end
      end
      adapter.query
    end

    def apply_order(query, direction)
      return query unless ["ASC", "DESC"].include?(direction)
      if @options[:sql_expression]
        query.order("#{@options[:sql_expression]} #{direction}, #{model.table_name}.id ASC")
      elsif self.reflection
        query.order("#{relation_table_name}.#{self.option_text_attribute} #{direction}, #{model.table_name}.id ASC")
      elsif is_table_column?
        query.order("#{model.table_name}.#{@name} #{direction}, #{model.table_name}.id ASC")
      else    
        query.order("#{@name} #{direction}, id ASC")
      end
    end

    def model
      @grid_class.model
    end
    
    def model_columns
      return [] unless model
      self.model.respond_to?(:all_columns) ? self.model.all_columns : self.model.columns
    end

    def sql_type
      return :unknown if self.model.blank?
      column = model_columns.find {|col| col.name.to_s == self.name.to_s}
      (column.try(:type) || association_type || :unknown).to_s.to_sym
    end

    def reflection
      @reflection ||= self.model.reflections[(@options[:through] || @name).to_sym]
    end

    def choices
      return @options[:choices] if @options[:choices].present?
      
      @choices ||= if self.reflection
        params_hash = { :grid => @grid_class.name, :column => @name.to_s, :text_attr => option_text_attribute }
        "/wulin_master/fetch_options?#{params_hash.to_param}"
      else
        []
      end
    end

    def reflection_options
      { :choices => (@options[:choices].presence || self.choices), :optionTextAttribute => self.option_text_attribute }
    end
    
    # For belongs_to association, the name of the attribute to display
    def option_text_attribute
      @options[:through] ? self.name : (@options[:option_text_attribute] || :name)
    end

    def foreign_key
      self.reflection.try(:foreign_key).to_s
    end

    def form_name
      foreign_key.presence || self.name
    end

    # Returns the sql names used to generate the select
    def sql_names
      if is_table_column?
        if self.reflection
          [self.model.table_name + "."+ foreign_key, self.reflection.klass.table_name + "." + option_text_attribute.to_s]
        else
          [self.model.table_name + "." + name.to_s]
        end
      else
        nil
      end
    end

    def presence_required?
      self.model.validators.find{|validator| (validator.class == ActiveModel::Validations::PresenceValidator) && validator.attributes.include?(@name.to_sym)}
    end

    # Returns the´includes to add to the query 
    def includes
      if self.reflection
        [(@options[:through] || @name).to_sym, association_through ? association_through.to_sym : nil].compact
      else
        []
      end
    end

    # Returns the´joins to add to the query
    def joins
      if self.reflection && presence_required?
        [(@options[:through] || @name).to_sym]
      else
        []
      end
    end

    # Returns the value for the object in argument
    def value(object)
      case association_type.to_s
      when /^belongs_to$|^has_one$/
        object.send(@options[:through] || self.name).try(:send,option_text_attribute).to_s
      when 'has_and_belongs_to_many'
        ids = object.send("#{self.reflection.klass.name.underscore}_ids")
        object.send(self.reflection.name.to_s).map{|x| x.send(option_text_attribute)}.join(',')
      when 'has_many'
        object.send(self.name.to_s).collect{|obj| obj.send(option_text_attribute)}
      else
        self.format(object.send(self.name.to_s))
      end
    end


    # Returns the json for the object in argument
    def json(object) 
      case association_type.to_s
      when 'belongs_to'
        {:id => object.send(foreign_key), option_text_attribute => object.send(@options[:through] || self.name).try(:send,option_text_attribute).to_s}
      when 'has_one'
        association_object = object.send(@options[:through] || self.name)
        {:id => association_object.try(:id), option_text_attribute => association_object.try(:send,option_text_attribute).to_s}
      when 'has_and_belongs_to_many'
        ids = object.send("#{self.reflection.klass.name.underscore}_ids")
        op_attribute = object.send(self.reflection.name.to_s).map{|x| x.send(option_text_attribute)}.join(',')
        {id: ids, option_text_attribute => op_attribute}
      when 'has_many'
        object.send(self.name.to_s).collect{|obj| {:id => obj.id, option_text_attribute => obj.send(option_text_attribute)}}
      else
        self.format(object.send(self.name.to_s))
      end
    end

    private
    
    def complete_column_name
      if @options[:sql_expression]
        "#{model.table_name}.#{@options[:sql_expression]}"
      elsif is_table_column?
        "#{model.table_name}.#{self.name}"
      elsif self.reflection
        "#{self.reflection.klass.table_name}.#{self.name}"
      else
        self.name
      end
    end
    
    def column_type(model, column_name)
      all_columns = model.respond_to?(:all_columns) ? model.all_columns : model.columns
      column = all_columns.find {|col| col.name.to_s == column_name.to_s}
      (column.try(:type) || :unknown).to_s.to_sym
    end
    
    def is_table_column?
      self.model.column_names.include?(self.name.to_s)
    end

    def association_type
      self.reflection.try(:macro)
    end

    def association_through
      self.reflection ? self.reflection.try(:options)[:through] : nil
    end
  end
end
